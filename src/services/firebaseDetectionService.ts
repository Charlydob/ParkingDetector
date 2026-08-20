import {
  onValue,
  push,
  ref,
  set,
  update,
  type DataSnapshot,
} from "firebase/database";
import { database } from "../lib/firebase";
import type {
  AssociationCandidate,
  Detection,
  ReviewStatus,
  StripeDiagnostic,
} from "../types/detection";

const detectionsRef = ref(database, "detections");
const connectedRef = ref(database, ".info/connected");
const stripeDiagnosticRef = ref(database, "diagnostics/stripe");

function removeUndefinedValues<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(
    Object.entries(value).filter(([, fieldValue]) => fieldValue !== undefined),
  ) as T;
}

function detectionFromSnapshot(snapshot: DataSnapshot): Detection[] {
  const value = snapshot.val() as Record<string, Omit<Detection, "id">> | null;

  if (!value) {
    return [];
  }

  return Object.entries(value)
    .map(([id, detection]) => ({
      ...detection,
      id,
    }))
    .sort(
      (left, right) =>
        new Date(right.detectedAt).getTime() - new Date(left.detectedAt).getTime(),
    );
}

export function listenToDetections(
  onDetections: (detections: Detection[]) => void,
  onError?: (error: Error) => void,
): () => void {
  return onValue(
    detectionsRef,
    (snapshot) => onDetections(detectionFromSnapshot(snapshot)),
    (error) => onError?.(error),
  );
}

export function listenToFirebaseConnection(
  onConnectionChange: (connected: boolean) => void,
): () => void {
  return onValue(connectedRef, (snapshot) => {
    onConnectionChange(snapshot.val() === true);
  });
}

export function listenToStripeDiagnostic(
  onDiagnostic: (diagnostic: StripeDiagnostic) => void,
  onError?: (error: Error) => void,
): () => void {
  return onValue(
    stripeDiagnosticRef,
    (snapshot) => onDiagnostic((snapshot.val() as StripeDiagnostic | null) ?? {}),
    (error) => onError?.(error),
  );
}

export async function createDetection(
  detection: Omit<Detection, "id">,
): Promise<Detection> {
  const newDetectionRef = push(detectionsRef);
  const firebaseDetection = removeUndefinedValues(detection);

  await set(newDetectionRef, firebaseDetection);

  return {
    ...detection,
    id: newDetectionRef.key ?? crypto.randomUUID(),
  };
}

export async function updateDetectionReviewStatus(
  detectionId: string,
  reviewStatus: ReviewStatus,
): Promise<void> {
  await update(ref(database, `detections/${detectionId}`), {
    reviewStatus,
  });
}

export async function confirmTemporalAssociation(
  detectionId: string,
  candidate: AssociationCandidate,
): Promise<void> {
  await update(ref(database, `detections/${detectionId}`), {
    associationStatus: "matched",
    reviewStatus: "confirmed",
    associationMethod: "temporal",
    reservationCode: candidate.reservationCode,
    room: candidate.room ?? null,
    guestName: candidate.fullName,
    guestEmail: candidate.guestEmail ?? null,
    checkInAt: candidate.checkInAt,
    timeDifferenceMinutes: candidate.timeDifferenceMinutes,
    confidence: candidate.confidence,
    parkingStatus: candidate.parkingStatus ?? "unknown",
    associationCandidates: null,
  });
}
