import {
  normalizeReservationRecord as normalizeSharedReservationRecord,
  normalizeReservationRecords as normalizeSharedReservationRecords,
  parseBoolean as parseSharedBoolean,
} from "../../shared/reservationRecordMapper.mjs";
import type { Reservation } from "../types/reservation";

export function parseBoolean(value: unknown): boolean {
  return parseSharedBoolean(value);
}

export function normalizeReservationRecord(
  record: Record<string, unknown>,
): Reservation {
  return normalizeSharedReservationRecord(record);
}

export function normalizeReservationRecords(
  records: Record<string, unknown>[],
): Reservation[] {
  return normalizeSharedReservationRecords(records);
}
