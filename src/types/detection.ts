export type ParkingStatus = "paid" | "unpaid" | "unknown";
export type AssociationStatus = "matched" | "ambiguous" | "unmatched";
export type ReviewStatus = "pending" | "confirmed" | "dismissed";

export interface Detection {
  id: string;
  plate: string;
  detectedAt: string;
  camera: string;

  snapshotUrl?: string;
  videoUrl?: string;

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

export interface FrigateDetectionInput {
  plate: string;
  detectedAt: string;
  camera: string;
  snapshotUrl?: string;
  videoUrl?: string;
}
