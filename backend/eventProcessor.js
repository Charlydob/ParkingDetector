import {
  applyTemporalAssociation,
  buildDetectionPayload,
  normalizePlate,
  parseConfigNumber,
} from "../shared/detectionLogic.mjs";
import { getReservations } from "./reservationService.js";
import {
  getEventDetectedAt,
  getRecognizedLicensePlate,
} from "./frigateClient.js";

export function createEventProcessor({
  firebaseClient,
  frigateClient,
  fileStorage,
  processedEvents,
  plateCooldown,
  onDetectionStored,
  onCheckInStored,
}) {
  function getMatchingOptions() {
    return {
      windowMinutes: parseConfigNumber(process.env.MATCH_TIME_WINDOW_MINUTES, 15),
      autoConfidenceThreshold: parseConfigNumber(
        process.env.MATCH_AUTO_CONFIDENCE_THRESHOLD,
        0.8,
      ),
    };
  }

  function getPlateCooldownMinutes() {
    return parseConfigNumber(process.env.PLATE_COOLDOWN_MINUTES, 15);
  }

  function findReservationByCode(reservations, reservationCode) {
    const normalizedCode = String(reservationCode ?? "").trim().toLowerCase();
    return reservations.find(
      (reservation) => reservation.reservationCode.toLowerCase() === normalizedCode,
    );
  }

  async function clearAuthorizedEvidence(detection) {
    if (
      detection.parkingStatus !== "paid" ||
      detection.associationStatus !== "matched" ||
      (!detection.localSnapshotPath && !detection.localVideoPath)
    ) {
      return detection;
    }

    for (const evidencePath of [detection.localSnapshotPath, detection.localVideoPath]) {
      if (!evidencePath) {
        continue;
      }

      try {
        await fileStorage.deleteEvidencePath(evidencePath);
        console.log(`[Evidence] Deleted authorized evidence: ${evidencePath}`);
      } catch (error) {
        console.warn(`[Evidence] Could not delete ${evidencePath}: ${error.message}`);
      }
    }

    await firebaseClient.updateDetection(detection.id, {
      localSnapshotPath: null,
      localVideoPath: null,
    });

    return {
      ...detection,
      localSnapshotPath: undefined,
      localVideoPath: undefined,
    };
  }

  async function applyTemporalMatchingToStoredDetections(checkIns) {
    const detections = await firebaseClient.getDetections();
    const options = getMatchingOptions();

    for (const detection of detections) {
      if (detection.associationStatus !== "unmatched") {
        continue;
      }

      const updated = applyTemporalAssociation(detection, checkIns, options);

      if (
        updated.associationStatus === detection.associationStatus &&
        updated.confidence === detection.confidence &&
        !updated.associationCandidates
      ) {
        continue;
      }

      await firebaseClient.updateDetection(detection.id, {
        parkingStatus: updated.parkingStatus,
        associationStatus: updated.associationStatus,
        associationMethod: updated.associationMethod,
        reservationCode: updated.reservationCode,
        room: updated.room,
        guestName: updated.guestName,
        guestEmail: updated.guestEmail,
        checkInAt: updated.checkInAt,
        timeDifferenceMinutes: updated.timeDifferenceMinutes,
        confidence: updated.confidence,
        associationCandidates: updated.associationCandidates,
      });

      await clearAuthorizedEvidence(updated);
    }
  }

  async function buildDetectionWithTemporalMatching(input, reservations) {
    const directPayload = buildDetectionPayload(input, reservations);

    if (
      directPayload.associationStatus !== "unmatched" ||
      directPayload.associationMethod === "plate"
    ) {
      return directPayload;
    }

    const checkIns = await firebaseClient.getCheckIns();
    return applyTemporalAssociation(directPayload, checkIns, getMatchingOptions());
  }

  async function processFrigateDetection(input) {
    const reservations = await getReservations();
    const detectionPayload = await buildDetectionWithTemporalMatching(input, reservations);
    const createdDetection = await firebaseClient.createDetection(detectionPayload);
    const detection = await clearAuthorizedEvidence(createdDetection);

    if (detectionPayload.associationStatus === "matched") {
      console.log(
        `[Reservations] Plate match: ${detectionPayload.plate} -> ${detectionPayload.reservationCode || "-"} / room ${detectionPayload.room || "-"}`,
      );
    } else {
      console.log(`[Reservations] No unique match: ${detectionPayload.associationStatus}`);
    }

    console.log("[Firebase] Detection stored");
    onDetectionStored?.(detection);
    return detection;
  }

  async function processDetectionWithCooldown(input) {
    const plate = normalizePlate(input.plate);
    const detectedAt = input.detectedAt || new Date().toISOString();

    if (
      plateCooldown?.isCoolingDown(
        plate,
        detectedAt,
        getPlateCooldownMinutes(),
      )
    ) {
      console.log(`[Cooldown] Ignored repeated plate ${plate}`);
      return undefined;
    }

    const detection = await processFrigateDetection({
      ...input,
      plate,
      detectedAt,
    });
    await plateCooldown?.mark(plate, detectedAt);
    return detection;
  }

  async function processCheckInEvent(input) {
    const reservationCode = String(input.reservationCode ?? "").trim();
    const fullName = String(input.fullName ?? "").trim();
    const now = new Date().toISOString();

    if (!reservationCode) {
      await firebaseClient.updateStripeDiagnostic({
        lastEventReceivedAt: now,
        lastStripeEventId: input.stripeEventId,
        lastReservationNumber: "",
        lastStatus: "invalid event",
        lastError: "Falta reservationNumber.",
      });
      throw new Error("No se puede crear check-in sin reservationNumber.");
    }

    const reservations = await getReservations();
    const reservation = findReservationByCode(reservations, reservationCode);
    const checkIn = await firebaseClient.createCheckIn({
      reservationCode,
      fullName: reservation?.name || fullName || "Sin nombre",
      checkInAt: input.checkInAt || now,
      source: input.source || "stripe",
      stripeEventId: input.stripeEventId,
      stripePaymentIntentId: input.stripePaymentIntentId,
      stripeCheckoutSessionId: input.stripeCheckoutSessionId,
      room: reservation?.room,
      guestEmail: reservation?.email,
      plate: reservation?.plate,
      parkingValid: reservation?.parkingValid,
      createdAt: now,
    });

    await firebaseClient.updateStripeDiagnostic({
      lastEventReceivedAt: now,
      lastStripeEventId: input.stripeEventId,
      lastCheckInCreatedAt: checkIn.createdAt,
      lastCheckInId: checkIn.id,
      lastReservationNumber: reservationCode,
      lastFullName: checkIn.fullName,
      lastStatus: reservation ? "matched reservation" : "reservation not found",
      lastError: null,
    });

    await applyTemporalMatchingToStoredDetections(await firebaseClient.getCheckIns());
    onCheckInStored?.(checkIn);
    return checkIn;
  }

  async function processFrigateEvent(event) {
    const eventId = event.id;

    if (!eventId || processedEvents.has(eventId)) {
      return undefined;
    }

    const plate = normalizePlate(getRecognizedLicensePlate(event));
    if (!plate) {
      return undefined;
    }

    const detectedAt = getEventDetectedAt(event);
    const camera = event.camera || "unknown";

    if (
      plateCooldown?.isCoolingDown(
        plate,
        detectedAt,
        getPlateCooldownMinutes(),
      )
    ) {
      console.log(`[Cooldown] Ignored repeated plate ${plate}`);
      await processedEvents.mark(eventId);
      return undefined;
    }

    console.log(`[LPR] New plate: ${plate}`);

    let localSnapshotPath;
    let localVideoPath;

    try {
      const snapshotBuffer = await frigateClient.getSnapshotBuffer(eventId);
      localSnapshotPath = await fileStorage.saveEvidenceBuffer({
        kind: "snapshot",
        eventId,
        plate,
        detectedAt,
        buffer: snapshotBuffer,
      });

      if (localSnapshotPath) {
        console.log("[Evidence] Snapshot saved");
      }
    } catch (error) {
      console.warn(`[Evidence] Snapshot not saved: ${error.message}`);
    }

    if (event.has_clip !== false) {
      try {
        const clipBuffer = await frigateClient.getClipBuffer(eventId);
        localVideoPath = await fileStorage.saveEvidenceBuffer({
          kind: "clip",
          eventId,
          plate,
          detectedAt,
          buffer: clipBuffer,
        });

        if (localVideoPath) {
          console.log("[Evidence] Clip saved");
        }
      } catch (error) {
        console.warn(`[Evidence] Clip not saved: ${error.message}`);
      }
    }

    const detection = await processFrigateDetection({
      plate,
      detectedAt,
      camera,
      localSnapshotPath,
      localVideoPath,
    });

    await processedEvents.mark(eventId);
    await plateCooldown?.mark(plate, detectedAt);
    return detection;
  }

  return {
    processFrigateDetection,
    processDetectionWithCooldown,
    processCheckInEvent,
    processFrigateEvent,
  };
}
