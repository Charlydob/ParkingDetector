import { normalizeReservationRecords } from "./reservationRecordMapper";
import type { Reservation } from "../types/reservation";
import { getEnvValue } from "../utils/env";

export async function getJsonReservations(): Promise<Reservation[]> {
  const jsonUrl = getEnvValue("VITE_RESERVATION_JSON_URL", "/demo-reservations.json");
  const response = await fetch(jsonUrl);

  if (!response.ok) {
    throw new Error(`Could not download reservation JSON (${response.status}).`);
  }

  const payload = await response.json();
  if (!Array.isArray(payload)) {
    throw new Error("Reservation JSON must be an array.");
  }

  return normalizeReservationRecords(payload);
}
