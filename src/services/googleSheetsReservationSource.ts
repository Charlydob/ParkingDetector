import { parseCsv } from "./csv";
import { normalizeReservationRecords } from "./reservationRecordMapper";
import type { Reservation } from "../types/reservation";
import { getEnvValue } from "../utils/env";

export async function getGoogleSheetsReservations(): Promise<Reservation[]> {
  const sheetUrl = getEnvValue("VITE_GOOGLE_SHEET_URL");

  if (!sheetUrl) {
    throw new Error("VITE_GOOGLE_SHEET_URL is not configured.");
  }

  const response = await fetch(sheetUrl);
  if (!response.ok) {
    throw new Error(`Could not download Google Sheets CSV (${response.status}).`);
  }

  const csvText = await response.text();
  return normalizeReservationRecords(parseCsv(csvText));
}
