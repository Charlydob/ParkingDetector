import {
  onValue,
  push,
  ref,
  set,
  update,
  type DataSnapshot,
} from "firebase/database";
import { database } from "../lib/firebase";
import type { Detection, ReviewStatus } from "../types/detection";

const detectionsRef = ref(database, "detections");
const connectedRef = ref(database, ".info/connected");

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
