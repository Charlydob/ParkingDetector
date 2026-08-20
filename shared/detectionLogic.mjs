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
    reservationCode: selectedReservation?.reservationCode,
    room: selectedReservation?.room,
    guestName: selectedReservation?.name,
    guestEmail: selectedReservation?.email,
    confidence: matches.length === 1 ? 1 : undefined,
    reviewStatus: statuses.reviewStatus,
    notificationSent: false,
  };
}
