export type ParkingStatus = "paid" | "unpaid" | "unknown";
export type AssociationStatus = "matched" | "ambiguous" | "unmatched";
export type AssociationMethod = "plate" | "temporal";
export type ReviewStatus = "pending" | "confirmed" | "dismissed";

export interface Reservation {
  reservationCode: string;
  name: string;
  email: string;
  plate: string;
  parkingValid: boolean;
  room: string;
}

export interface CheckInEvent {
  id: string;
  reservationCode: string;
  fullName: string;
  checkInAt: string;
  source: "stripe" | "test";
  stripeEventId?: string;
  stripePaymentIntentId?: string;
  stripeCheckoutSessionId?: string;
  room?: string;
  guestEmail?: string;
  plate?: string;
  parkingValid?: boolean;
  createdAt: string;
}

export interface AssociationCandidate {
  reservationCode: string;
  room?: string;
  fullName: string;
  guestEmail?: string;
  checkInAt: string;
  parkingStatus?: ParkingStatus;
  timeDifferenceMinutes: number;
  confidence: number;
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
  associationMethod?: AssociationMethod;
  checkInAt?: string;
  timeDifferenceMinutes?: number;
  associationCandidates?: AssociationCandidate[];
  reservationCode?: string;
  room?: string;
  guestName?: string;
  guestEmail?: string;
  confidence?: number;
  reviewStatus: ReviewStatus;
  notificationSent?: boolean;
}

export function normalizePlate(value: string | null | undefined): string;
export function parseConfigNumber(value: string | undefined, fallback: number): number;
export function getTimeDifferenceMinutes(
  leftIsoDate: string,
  rightIsoDate: string,
): number | undefined;
export function calculateTemporalConfidence(
  timeDifferenceMinutes: number,
  nearbyCandidateCount?: number,
): number;
export function findTemporalCandidates(
  detection: DetectionPayload,
  checkIns: CheckInEvent[],
  options?: {
    windowMinutes?: number;
  },
): AssociationCandidate[];
export function applyTemporalAssociation(
  detection: DetectionPayload,
  checkIns: CheckInEvent[],
  options?: {
    windowMinutes?: number;
    autoConfidenceThreshold?: number;
  },
): DetectionPayload;
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
