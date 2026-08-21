import type { Reservation } from "./detectionLogic.mjs";
import type { RESERVATION_COLUMN_MAPPING } from "./reservationMapping.mjs";

type ReservationColumnMapping = typeof RESERVATION_COLUMN_MAPPING;

export interface ReservationSourcePreview {
  reservationsFound: number;
  detectedFields: string[];
  detectedFieldCount: number;
  sampleRecord: Record<string, unknown>;
  sampleNormalized: Reservation;
  mappedFields: string[];
  missingOptionalFields: string[];
  ignoredFields: string[];
  errors: string[];
}

export function parseBoolean(value: unknown): boolean;
export function getValueByPath(record: Record<string, unknown>, path: string): unknown;
export function normalizeReservationRecord(
  record: Record<string, unknown>,
  mapping?: ReservationColumnMapping,
): Reservation;
export function normalizeReservationRecords(
  records: Record<string, unknown>[],
  mapping?: ReservationColumnMapping,
): Reservation[];
export function extractReservationRecords(
  payload: unknown,
  jsonPath?: string,
): Record<string, unknown>[];
export function detectReservationFields(records: Record<string, unknown>[]): string[];
export function maskReservationRecord(record: Record<string, unknown>): Record<string, unknown>;
export function buildReservationSourcePreview(
  records: Record<string, unknown>[],
  mapping?: ReservationColumnMapping,
): ReservationSourcePreview;
