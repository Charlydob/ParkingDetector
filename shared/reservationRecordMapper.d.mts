import type { Reservation } from "./detectionLogic.mjs";

export function parseBoolean(value: unknown): boolean;
export function normalizeReservationRecord(record: Record<string, unknown>): Reservation;
export function normalizeReservationRecords(
  records: Record<string, unknown>[],
): Reservation[];
