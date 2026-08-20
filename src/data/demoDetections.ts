import type { FrigateDetectionInput } from "../types/detection";

export const demoDetectionInputs: FrigateDetectionInput[] = [
  {
    plate: "BE 123 456",
    detectedAt: new Date().toISOString(),
    camera: "Parking Norte",
  },
  {
    plate: "zh-987654",
    detectedAt: new Date().toISOString(),
    camera: "Parking Sur",
  },
  {
    plate: "XX 000 999",
    detectedAt: new Date().toISOString(),
    camera: "Entrada Principal",
  },
];
