import { RESERVATION_COLUMN_MAPPING } from "../config/reservationMapping";
import type { Reservation } from "../types/reservation";
import { normalizePlate } from "../utils/normalizePlate";

type RawReservationRecord = Record<string, unknown>;

const TRUE_VALUES = new Set(["true", "yes", "si", "1", "y", "s"]);
const FALSE_VALUES = new Set(["false", "no", "0", "n"]);

function cleanHeader(value: string): string {
  return value.trim();
}

function getMappedValue(record: RawReservationRecord, internalKey: keyof Reservation): unknown {
  const mappedColumn = RESERVATION_COLUMN_MAPPING[internalKey];
  const directValue = record[mappedColumn];

  if (directValue !== undefined) {
    return directValue;
  }

  const matchingKey = Object.keys(record).find(
    (key) => cleanHeader(key).toLowerCase() === cleanHeader(mappedColumn).toLowerCase(),
  );

  return matchingKey ? record[matchingKey] : undefined;
}

export function parseBoolean(value: unknown): boolean {
  if (typeof value === "boolean") {
    return value;
  }

  const normalized = String(value ?? "")
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

  if (TRUE_VALUES.has(normalized)) {
    return true;
  }

  if (FALSE_VALUES.has(normalized)) {
    return false;
  }

  return false;
}

export function normalizeReservationRecord(record: RawReservationRecord): Reservation {
  return {
    reservationCode: String(getMappedValue(record, "reservationCode") ?? "").trim(),
    name: String(getMappedValue(record, "name") ?? "").trim(),
    email: String(getMappedValue(record, "email") ?? "").trim(),
    plate: normalizePlate(String(getMappedValue(record, "plate") ?? "")),
    parkingValid: parseBoolean(getMappedValue(record, "parkingValid")),
    room: String(getMappedValue(record, "room") ?? "").trim(),
  };
}

export function normalizeReservationRecords(records: RawReservationRecord[]): Reservation[] {
  return records
    .map(normalizeReservationRecord)
    .filter((reservation) => reservation.reservationCode || reservation.name || reservation.plate);
}
