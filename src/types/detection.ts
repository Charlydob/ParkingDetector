export type ParkingStatus = "paid" | "unpaid" | "unknown";
export type AssociationStatus = "matched" | "ambiguous" | "unmatched";
export type AssociationMethod = "plate" | "temporal";
export type ReviewStatus = "pending" | "confirmed" | "dismissed";

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

export interface Detection {
  id: string;
  plate: string;
  detectedAt: string;
  camera: string;

  snapshotUrl?: string;
  videoUrl?: string;
  localSnapshotPath?: string;
  localVideoPath?: string;

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

export interface FrigateDetectionInput {
  plate: string;
  detectedAt: string;
  camera: string;
  snapshotUrl?: string;
  videoUrl?: string;
  localSnapshotPath?: string;
  localVideoPath?: string;
}

export interface StripeDiagnostic {
  lastEventReceivedAt?: string;
  lastStripeEventId?: string;
  lastCheckInCreatedAt?: string;
  lastCheckInId?: string;
  lastReservationNumber?: string;
  lastFullName?: string;
  lastStatus?: "matched reservation" | "reservation not found" | "invalid event";
  lastError?: string | null;
}
