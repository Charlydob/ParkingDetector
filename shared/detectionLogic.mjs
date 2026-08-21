export function normalizePlate(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

export function findReservationMatches(plate, reservations) {
  return reservations.filter((reservation) => reservation.plate === plate);
}

export function parseConfigNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function getTimeDifferenceMinutes(leftIsoDate, rightIsoDate) {
  const left = new Date(leftIsoDate).getTime();
  const right = new Date(rightIsoDate).getTime();

  if (!Number.isFinite(left) || !Number.isFinite(right)) {
    return undefined;
  }

  return (right - left) / 60000;
}

export function calculateTemporalConfidence(timeDifferenceMinutes, nearbyCandidateCount = 1) {
  if (!Number.isFinite(timeDifferenceMinutes)) {
    return 0;
  }

  let confidence = 0;

  if (timeDifferenceMinutes <= 2) {
    confidence = 0.95;
  } else if (timeDifferenceMinutes <= 5) {
    confidence = 0.88;
  } else if (timeDifferenceMinutes <= 10) {
    confidence = 0.7;
  } else if (timeDifferenceMinutes <= 15) {
    confidence = 0.55;
  }

  const crowdedPenalty = Math.max(0, nearbyCandidateCount - 1) * 0.08;
  return Math.max(0, Number((confidence - crowdedPenalty).toFixed(2)));
}

export function buildAssociationCandidate(checkIn, timeDifferenceMinutes, candidateCount) {
  return {
    reservationCode: checkIn.reservationCode,
    room: checkIn.room,
    fullName: checkIn.fullName,
    guestEmail: checkIn.guestEmail,
    checkInAt: checkIn.checkInAt,
    parkingStatus:
      typeof checkIn.parkingValid === "boolean"
        ? checkIn.parkingValid
          ? "paid"
          : "unpaid"
        : "unknown",
    timeDifferenceMinutes: Number(timeDifferenceMinutes.toFixed(2)),
    confidence: calculateTemporalConfidence(timeDifferenceMinutes, candidateCount),
  };
}

function hasValidDate(value) {
  return Number.isFinite(new Date(value).getTime());
}

export function findTemporalCandidates(detection, checkIns, options = {}) {
  const windowMinutes = options.windowMinutes ?? 15;

  if (!hasValidDate(detection.detectedAt)) {
    return [];
  }

  const rawCandidates = checkIns
    .map((checkIn) => ({
      checkIn,
      timeDifferenceMinutes: getTimeDifferenceMinutes(
        detection.detectedAt,
        checkIn.checkInAt,
      ),
    }))
    .filter(
      ({ timeDifferenceMinutes }) =>
        timeDifferenceMinutes !== undefined &&
        timeDifferenceMinutes >= 0 &&
        timeDifferenceMinutes <= windowMinutes,
    )
    .sort((left, right) => left.timeDifferenceMinutes - right.timeDifferenceMinutes);

  return rawCandidates.map(({ checkIn, timeDifferenceMinutes }) =>
    buildAssociationCandidate(checkIn, timeDifferenceMinutes, rawCandidates.length),
  );
}

function isDominantCandidate(candidates) {
  if (candidates.length === 1) {
    return true;
  }

  const [best, second] = candidates;
  if (!best || !second) {
    return false;
  }

  return (
    best.confidence - second.confidence >= 0.12 ||
    second.timeDifferenceMinutes - best.timeDifferenceMinutes >= 3
  );
}

export function applyTemporalAssociation(detection, checkIns, options = {}) {
  if (detection.associationStatus !== "unmatched" || detection.associationMethod === "plate") {
    return detection;
  }

  const threshold = options.autoConfidenceThreshold ?? 0.8;
  const candidates = findTemporalCandidates(detection, checkIns, options);

  if (candidates.length === 0) {
    return {
      ...detection,
      associationStatus: "unmatched",
      confidence: 0,
      associationCandidates: undefined,
    };
  }

  const [bestCandidate] = candidates;

  if (
    bestCandidate.confidence >= threshold &&
    isDominantCandidate(candidates)
  ) {
    return {
      ...detection,
      parkingStatus: bestCandidate.parkingStatus,
      associationStatus: "matched",
      associationMethod: "temporal",
      reservationCode: bestCandidate.reservationCode,
      room: bestCandidate.room,
      guestName: bestCandidate.fullName,
      guestEmail: bestCandidate.guestEmail,
      checkInAt: bestCandidate.checkInAt,
      timeDifferenceMinutes: bestCandidate.timeDifferenceMinutes,
      confidence: bestCandidate.confidence,
      associationCandidates: undefined,
    };
  }

  return {
    ...detection,
    associationStatus: "ambiguous",
    confidence: bestCandidate.confidence,
    associationCandidates: candidates,
  };
}

export function resolveDetectionStatuses(matches) {
  if (matches.length === 0) {
    return {
      parkingStatus: "unknown",
      associationStatus: "unmatched",
      reviewStatus: "pending",
    };
  }

  if (matches.length > 1) {
    return {
      parkingStatus: "unknown",
      associationStatus: "ambiguous",
      reviewStatus: "pending",
    };
  }

  if (matches[0].parkingValid) {
    return {
      parkingStatus: "paid",
      associationStatus: "matched",
      reviewStatus: "confirmed",
    };
  }

  return {
    parkingStatus: "unpaid",
    associationStatus: "matched",
    reviewStatus: "pending",
  };
}

export function buildDetectionPayload(input, reservations) {
  const normalizedPlate = normalizePlate(input.plate);
  const matches = findReservationMatches(normalizedPlate, reservations);
  const selectedReservation = matches.length === 1 ? matches[0] : undefined;
  const statuses = resolveDetectionStatuses(matches);

  return {
    plate: normalizedPlate,
    detectedAt: input.detectedAt,
    camera: String(input.camera ?? "").trim(),
    snapshotUrl: input.snapshotUrl,
    videoUrl: input.videoUrl,
    localSnapshotPath: input.localSnapshotPath,
    localVideoPath: input.localVideoPath,
    parkingStatus: statuses.parkingStatus,
    associationStatus: statuses.associationStatus,
    associationMethod: matches.length === 1 ? "plate" : undefined,
    reservationCode: selectedReservation?.reservationCode,
    room: selectedReservation?.room,
    guestName: selectedReservation?.name,
    guestEmail: selectedReservation?.email,
    confidence: matches.length === 1 ? 1 : matches.length === 0 ? 0 : undefined,
    reviewStatus: statuses.reviewStatus,
    notificationSent: false,
  };
}
