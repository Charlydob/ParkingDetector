import { parseCsv } from "./csv";
import { normalizeReservationRecords } from "./reservationRecordMapper";
import type { Reservation } from "../types/reservation";
import { getEnvValue } from "../utils/env";

export async function getGoogleSheetsReservations(): Promise<Reservation[]> {
  const sheetUrl = getEnvValue("VITE_GOOGLE_SHEET_URL");

  if (!sheetUrl) {
    throw new Error("Falta configurar VITE_GOOGLE_SHEET_URL.");
  }

  const response = await fetch(sheetUrl);
  if (!response.ok) {
    throw new Error(`No se pudo descargar Google Sheets (${response.status}).`);
  }

  const csvText = await response.text();
  return normalizeReservationRecords(parseCsv(csvText));
}
