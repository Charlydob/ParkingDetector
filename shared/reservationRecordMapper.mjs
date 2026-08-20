import { normalizePlate } from "./detectionLogic.mjs";
import { RESERVATION_COLUMN_MAPPING } from "./reservationMapping.mjs";

const TRUE_VALUES = new Set(["true", "yes", "si", "1", "y", "s"]);
const FALSE_VALUES = new Set(["false", "no", "0", "n"]);

function cleanHeader(value) {
  return String(value ?? "").trim();
}

function getMappedValue(record, internalKey) {
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

export function parseBoolean(value) {
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

export function normalizeReservationRecord(record) {
  return {
    reservationCode: String(getMappedValue(record, "reservationCode") ?? "").trim(),
    name: String(getMappedValue(record, "name") ?? "").trim(),
    email: String(getMappedValue(record, "email") ?? "").trim(),
    plate: normalizePlate(String(getMappedValue(record, "plate") ?? "")),
    parkingValid: parseBoolean(getMappedValue(record, "parkingValid")),
    room: String(getMappedValue(record, "room") ?? "").trim(),
  };
}

export function normalizeReservationRecords(records) {
  return records
    .map(normalizeReservationRecord)
    .filter((reservation) => reservation.reservationCode || reservation.name || reservation.plate);
}
