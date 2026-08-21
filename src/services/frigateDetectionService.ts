import type { Detection, FrigateDetectionInput } from "../types/detection";
import { getBackendUrl } from "./backendConfigService";

export async function processFrigateDetection(
  input: FrigateDetectionInput,
): Promise<Detection> {
  const response = await fetch(`${getBackendUrl()}/api/test-detection`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(input),
  });

  if (!response.ok) {
    throw new Error(`Could not simulate the detection (${response.status}).`);
  }

  const payload = await response.json() as {
    detection?: Detection;
    ignoredByCooldown?: boolean;
  };

  if (payload.ignoredByCooldown || !payload.detection) {
    throw new Error("Detection ignored by license plate cooldown.");
  }

  return payload.detection;
}
