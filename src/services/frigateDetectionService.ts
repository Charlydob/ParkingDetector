import { createDetection } from "./firebaseDetectionService";
import { getReservations } from "./reservationService";
import type {
  AssociationStatus,
  Detection,
  FrigateDetectionInput,
  ParkingStatus,
  ReviewStatus,
} from "../types/detection";
import type { Reservation } from "../types/reservation";
import { normalizePlate } from "../utils/normalizePlate";

function findReservationMatches(
  plate: string,
  reservations: Reservation[],
): Reservation[] {
  return reservations.filter((reservation) => reservation.plate === plate);
}

function resolveStatuses(matches: Reservation[]): {
  parkingStatus: ParkingStatus;
  associationStatus: AssociationStatus;
  reviewStatus: ReviewStatus;
} {
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

export async function processFrigateDetection(
  input: FrigateDetectionInput,
): Promise<Detection> {
  const normalizedPlate = normalizePlate(input.plate);
  const reservations = await getReservations();
  const matches = findReservationMatches(normalizedPlate, reservations);
  const selectedReservation = matches.length === 1 ? matches[0] : undefined;
  const statuses = resolveStatuses(matches);

  return createDetection({
    plate: normalizedPlate,
    detectedAt: input.detectedAt,
    camera: input.camera.trim(),
    snapshotUrl: input.snapshotUrl,
    videoUrl: input.videoUrl,
    parkingStatus: statuses.parkingStatus,
    associationStatus: statuses.associationStatus,
    reservationCode: selectedReservation?.reservationCode,
    room: selectedReservation?.room,
    guestName: selectedReservation?.name,
    guestEmail: selectedReservation?.email,
    confidence: matches.length === 1 ? 1 : undefined,
    reviewStatus: statuses.reviewStatus,
    notificationSent: false,
  });
}
