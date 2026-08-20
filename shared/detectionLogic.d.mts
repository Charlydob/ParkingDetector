export type ParkingStatus = "paid" | "unpaid" | "unknown";
export type AssociationStatus = "matched" | "ambiguous" | "unmatched";
export type ReviewStatus = "pending" | "confirmed" | "dismissed";

export interface Reservation {
  reservationCode: string;
  name: string;
  email: string;
  plate: string;
  parkingValid: boolean;
  room: string;
}

export interface DetectionInput {
  plate: string;
  detectedAt: string;
  camera: string;
  snapshotUrl?: string;
  videoUrl?: string;
  localSnapshotPath?: string;
  localVideoPath?: string;
}

export interface DetectionPayload extends DetectionInput {
  parkingStatus: ParkingStatus;
  associationStatus: AssociationStatus;
  reservationCode?: string;
  room?: string;
  guestName?: string;
  guestEmail?: string;
  confidence?: number;
  reviewStatus: ReviewStatus;
  notificationSent?: boolean;
}

export function normalizePlate(value: string | null | undefined): string;
export function findReservationMatches(
  plate: string,
  reservations: Reservation[],
): Reservation[];
export function resolveDetectionStatuses(matches: Reservation[]): {
  parkingStatus: ParkingStatus;
  associationStatus: AssociationStatus;
  reviewStatus: ReviewStatus;
};
export function buildDetectionPayload(
  input: DetectionInput,
  reservations: Reservation[],
): DetectionPayload;
