import type { Detection, FrigateDetectionInput } from "../types/detection";

const backendBaseUrl = import.meta.env.VITE_BACKEND_URL || "http://127.0.0.1:3001";

export async function processFrigateDetection(
  input: FrigateDetectionInput,
): Promise<Detection> {
  const response = await fetch(`${backendBaseUrl}/api/test-detection`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(input),
  });

  if (!response.ok) {
    throw new Error(`No se pudo simular la deteccion (${response.status}).`);
  }

  const payload = await response.json() as {
    detection?: Detection;
    ignoredByCooldown?: boolean;
  };

  if (payload.ignoredByCooldown || !payload.detection) {
    throw new Error("Deteccion ignorada por cooldown de matricula.");
  }

  return payload.detection;
}
