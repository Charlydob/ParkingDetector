import { normalizePlate } from "./detectionLogic.mjs";
import {
  RESERVATION_COLUMN_MAPPING,
  RESERVATION_MAPPING_FIELDS,
} from "./reservationMapping.mjs";

const TRUE_VALUES = new Set(["true", "yes", "si", "1", "y", "s"]);
const FALSE_VALUES = new Set(["false", "no", "0", "n"]);
const COMMON_RESERVATION_PATHS = [
  "",
  "reservations",
  "data.reservations",
  "results",
  "bookings",
  "data",
];
const PII_FIELD_HINTS = ["name", "guest", "email", "phone", "address"];

function cleanHeader(value) {
  return String(value ?? "").trim();
}

function isPlainObject(value) {
  return value && typeof value === "object" && !Array.isArray(value);
}

function splitPath(path) {
  return cleanHeader(path).split(".").filter(Boolean);
}

export function getValueByPath(record, path) {
  const parts = splitPath(path);

  if (parts.length === 0) {
    return undefined;
  }

  let current = record;
  for (const part of parts) {
    if (!isPlainObject(current) && !Array.isArray(current)) {
      return undefined;
    }

    current = current[part];
  }

  return current;
}

function getMappedValue(record, internalKey, mapping) {
  const mappedColumn = mapping[internalKey];

  if (!mappedColumn) {
    return undefined;
  }

  const directValue = getValueByPath(record, mappedColumn);

  if (directValue !== undefined) {
    return directValue;
  }

  if (mappedColumn.includes(".")) {
    return undefined;
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

function parseOptionalNumber(value) {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function parseOptionalString(value) {
  const parsed = String(value ?? "").trim();
  return parsed || undefined;
}

function parseOptionalDate(value) {
  const parsed = parseOptionalString(value);

  if (!parsed) {
    return undefined;
  }

  const timestamp = new Date(parsed).getTime();
  if (!Number.isFinite(timestamp)) {
    return parsed;
  }

  return new Date(timestamp).toISOString();
}

function deriveParkingEndAt(reservation) {
  if (reservation.parkingEndAt || reservation.checkOutAt || reservation.departureAt) {
    return reservation.parkingEndAt;
  }

  if (!reservation.arrivalAt || !Number.isFinite(reservation.nights)) {
    return undefined;
  }

  const arrivalTime = new Date(reservation.arrivalAt).getTime();
  if (!Number.isFinite(arrivalTime)) {
    return undefined;
  }

  return new Date(arrivalTime + reservation.nights * 24 * 60 * 60 * 1000).toISOString();
}

function normalizeMapping(mapping = RESERVATION_COLUMN_MAPPING) {
  return {
    ...RESERVATION_COLUMN_MAPPING,
    ...mapping,
    customFields: Array.isArray(mapping.customFields) ? mapping.customFields : [],
  };
}

export function normalizeReservationRecord(record, mapping = RESERVATION_COLUMN_MAPPING) {
  const normalizedMapping = normalizeMapping(mapping);
  const reservation = {
    reservationCode: parseOptionalString(
      getMappedValue(record, "reservationCode", normalizedMapping),
    ) || "",
    name: parseOptionalString(getMappedValue(record, "name", normalizedMapping)) || "",
    email: parseOptionalString(getMappedValue(record, "email", normalizedMapping)) || "",
    plate: normalizePlate(String(getMappedValue(record, "plate", normalizedMapping) ?? "")),
    parkingValid: parseBoolean(getMappedValue(record, "parkingValid", normalizedMapping)),
    room: parseOptionalString(getMappedValue(record, "room", normalizedMapping)) || "",
    arrivalAt: parseOptionalDate(getMappedValue(record, "arrivalAt", normalizedMapping)),
    departureAt: parseOptionalDate(getMappedValue(record, "departureAt", normalizedMapping)),
    checkInAt: parseOptionalDate(getMappedValue(record, "checkInAt", normalizedMapping)),
    checkOutAt: parseOptionalDate(getMappedValue(record, "checkOutAt", normalizedMapping)),
    nights: parseOptionalNumber(getMappedValue(record, "nights", normalizedMapping)),
    reservationStatus: parseOptionalString(
      getMappedValue(record, "reservationStatus", normalizedMapping),
    ),
    parkingStartAt: parseOptionalDate(
      getMappedValue(record, "parkingStartAt", normalizedMapping),
    ),
    parkingEndAt: parseOptionalDate(getMappedValue(record, "parkingEndAt", normalizedMapping)),
  };

  reservation.parkingEndAt = deriveParkingEndAt(reservation) || reservation.parkingEndAt;

  const extraFields = Object.fromEntries(
    normalizedMapping.customFields
      .map((field) => {
        const internalName = cleanHeader(field.internalName);
        const externalField = cleanHeader(field.externalField);
        return [internalName, externalField ? getValueByPath(record, externalField) : undefined];
      })
      .filter(([internalName, value]) => internalName && value !== undefined),
  );

  if (Object.keys(extraFields).length > 0) {
    reservation.extraFields = extraFields;
  }

  return reservation;
}

export function normalizeReservationRecords(records, mapping = RESERVATION_COLUMN_MAPPING) {
  return records
    .filter(isPlainObject)
    .map((record) => normalizeReservationRecord(record, mapping))
    .filter((reservation) => reservation.reservationCode);
}

export function extractReservationRecords(payload, jsonPath = "") {
  const configuredValue = jsonPath ? getValueByPath(payload, jsonPath) : payload;

  if (Array.isArray(configuredValue)) {
    return configuredValue.filter(isPlainObject);
  }

  if (jsonPath) {
    return [];
  }

  for (const path of COMMON_RESERVATION_PATHS) {
    const value = path ? getValueByPath(payload, path) : payload;
    if (Array.isArray(value)) {
      return value.filter(isPlainObject);
    }
  }

  return isPlainObject(payload) ? [payload] : [];
}

function collectFields(value, prefix = "", fields = new Set()) {
  if (!isPlainObject(value)) {
    return fields;
  }

  for (const [key, fieldValue] of Object.entries(value)) {
    const fieldPath = prefix ? `${prefix}.${key}` : key;
    fields.add(fieldPath);

    if (isPlainObject(fieldValue)) {
      collectFields(fieldValue, fieldPath, fields);
    }
  }

  return fields;
}

export function detectReservationFields(records) {
  const fields = new Set();

  for (const record of records.slice(0, 10)) {
    collectFields(record, "", fields);
  }

  return [...fields].sort((left, right) => left.localeCompare(right));
}

function maskValue(key, value) {
  if (value === undefined || value === null) {
    return value;
  }

  const normalizedKey = key.toLowerCase();
  if (PII_FIELD_HINTS.some((hint) => normalizedKey.includes(hint))) {
    const text = String(value);
    return text.length <= 2 ? "***" : `${text.slice(0, 1)}***${text.slice(-1)}`;
  }

  if (isPlainObject(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([childKey, childValue]) => [
        childKey,
        maskValue(childKey, childValue),
      ]),
    );
  }

  return value;
}

export function maskReservationRecord(record) {
  if (!isPlainObject(record)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(record).map(([key, value]) => [key, maskValue(key, value)]),
  );
}

export function buildReservationSourcePreview(records, mapping = RESERVATION_COLUMN_MAPPING) {
  const detectedFields = detectReservationFields(records);
  const sampleRecord = records.find(isPlainObject) || {};
  const sampleNormalized = normalizeReservationRecord(sampleRecord, mapping);
  const mappedFields = new Set([
    ...Object.values(normalizeMapping(mapping)).filter((value) => typeof value === "string"),
    ...(Array.isArray(mapping.customFields)
      ? mapping.customFields.map((field) => cleanHeader(field.externalField)).filter(Boolean)
      : []),
  ]);
  const standardKeys = RESERVATION_MAPPING_FIELDS.map((field) => field.key);
  const missingOptionalFields = standardKeys
    .filter((key) => key !== "reservationCode")
    .filter((key) => !sampleNormalized[key]);
  const ignoredFields = detectedFields.filter((field) => !mappedFields.has(field));
  const errors = sampleNormalized.reservationCode
    ? []
    : ["reservationCode is required for normalized reservations."];

  return {
    reservationsFound: records.length,
    detectedFields,
    detectedFieldCount: detectedFields.length,
    sampleRecord: maskReservationRecord(sampleRecord),
    sampleNormalized,
    mappedFields: standardKeys.filter((key) => Boolean(sampleNormalized[key])),
    missingOptionalFields,
    ignoredFields,
    errors,
  };
}
