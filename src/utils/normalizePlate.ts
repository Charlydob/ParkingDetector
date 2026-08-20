import { normalizePlate as normalizeSharedPlate } from "../../shared/detectionLogic.mjs";

export function normalizePlate(value: string | null | undefined): string {
  return normalizeSharedPlate(value);
}
