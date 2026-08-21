import { getDemoReservations } from "./demoReservationSource";
import { getGoogleSheetsReservations } from "./googleSheetsReservationSource";
import { getJsonReservations } from "./jsonReservationSource";
import {
  getBackendReservationDebug,
  refreshBackendReservations,
} from "./backendApi";
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
    const payload = await getBackendReservationDebug();

    return {
      reservations: payload.reservations,
      source: payload.source,
      updatedAt: payload.lastReservationRefreshAt || new Date().toISOString(),
      error: payload.reservationLoadError || undefined,
    };
  } catch {
    // GitHub Pages can still run without the local backend.
  }

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
      error: error instanceof Error ? error.message : "Unknown error while loading reservations.",
    };
  }
}

export async function refreshReservationsWithDiagnostics(): Promise<ReservationLoadResult> {
  try {
    const payload = await refreshBackendReservations();

    return {
      reservations: payload.reservations,
      source: payload.source,
      updatedAt: payload.lastReservationRefreshAt || new Date().toISOString(),
      error: payload.reservationLoadError || undefined,
    };
  } catch {
    return loadReservationsWithDiagnostics();
  }
}
