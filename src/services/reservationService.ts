import { getDemoReservations } from "./demoReservationSource";
import { getGoogleSheetsReservations } from "./googleSheetsReservationSource";
import { getJsonReservations } from "./jsonReservationSource";
import type {
  Reservation,
  ReservationLoadResult,
  ReservationSourceName,
} from "../types/reservation";
import { getEnvValue } from "../utils/env";

export function getReservationSourceName(): ReservationSourceName {
  const configuredSource = getEnvValue("VITE_RESERVATION_SOURCE", "demo");

  if (
    configuredSource === "googleSheets" ||
    configuredSource === "json" ||
    configuredSource === "demo"
  ) {
    return configuredSource;
  }

  return "demo";
}

export async function getReservations(): Promise<Reservation[]> {
  const source = getReservationSourceName();

  if (source === "googleSheets") {
    return getGoogleSheetsReservations();
  }

  if (source === "json") {
    return getJsonReservations();
  }

  return getDemoReservations();
}

export async function loadReservationsWithDiagnostics(): Promise<ReservationLoadResult> {
  const source = getReservationSourceName();

  try {
    const reservations = await getReservations();
    return {
      reservations,
      source,
      updatedAt: new Date().toISOString(),
    };
  } catch (error) {
    return {
      reservations: [],
      source,
      updatedAt: new Date().toISOString(),
      error: error instanceof Error ? error.message : "Error desconocido al cargar reservas.",
    };
  }
}
