import { buildDetectionPayload } from "../../shared/detectionLogic.mjs";
import { createDetection } from "./firebaseDetectionService";
import { getReservations } from "./reservationService";
import type { Detection, FrigateDetectionInput } from "../types/detection";

export async function processFrigateDetection(
  input: FrigateDetectionInput,
): Promise<Detection> {
  const reservations = await getReservations();
  return createDetection(buildDetectionPayload(input, reservations));
}
