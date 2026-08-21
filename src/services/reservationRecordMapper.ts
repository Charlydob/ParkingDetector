import {
  normalizeReservationRecord as normalizeSharedReservationRecord,
  normalizeReservationRecords as normalizeSharedReservationRecords,
  parseBoolean as parseSharedBoolean,
} from "../../shared/reservationRecordMapper.mjs";
import type { Reservation } from "../types/reservation";

interface ReservationColumnMapping {
  reservationCode: string;
  name: string;
  email: string;
  plate: string;
  parkingValid: string;
  room: string;
  arrivalAt?: string;
  departureAt?: string;
  checkInAt?: string;
  checkOutAt?: string;
  nights?: string;
  reservationStatus?: string;
  parkingStartAt?: string;
  parkingEndAt?: string;
  customFields?: Array<{
    internalName: string;
    externalField: string;
  }>;
}

export function parseBoolean(value: unknown): boolean {
  return parseSharedBoolean(value);
}

export function normalizeReservationRecord(
  record: Record<string, unknown>,
  mapping?: ReservationColumnMapping,
): Reservation {
  return normalizeSharedReservationRecord(record, mapping);
}

export function normalizeReservationRecords(
  records: Record<string, unknown>[],
  mapping?: ReservationColumnMapping,
): Reservation[] {
  return normalizeSharedReservationRecords(records, mapping);
}
