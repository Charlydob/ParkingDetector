import { readFile } from "node:fs/promises";
import path from "node:path";
import { parseCsv } from "../shared/csv.mjs";
import { normalizeReservationRecords } from "../shared/reservationRecordMapper.mjs";
import { parseConfigNumber } from "../shared/detectionLogic.mjs";

const VALID_SOURCES = new Set(["demo", "googleSheets", "json"]);

let cache = {
  key: "",
  source: "demo",
  reservations: [],
  loadedAtMs: 0,
  lastReservationRefreshAt: null,
  reservationLoadError: null,
};
let loadingPromise;
let lastLogSignature = "";

function getEnvValue(primaryName, legacyName, fallback = "") {
  return process.env[primaryName] || process.env[legacyName] || fallback;
}

function getConfiguredSource() {
  const source = getEnvValue(
    "RESERVATION_SOURCE",
    "VITE_RESERVATION_SOURCE",
    "demo",
  ).trim();

  return VALID_SOURCES.has(source) ? source : "demo";
}

function getReservationCacheSeconds() {
  return parseConfigNumber(process.env.RESERVATION_CACHE_SECONDS, 30);
}

function getConfigKey() {
  return JSON.stringify({
    source: getConfiguredSource(),
    googleSheetUrl: getEnvValue("GOOGLE_SHEET_URL", "VITE_GOOGLE_SHEET_URL"),
    jsonUrl: getEnvValue("RESERVATION_JSON_URL", "VITE_RESERVATION_JSON_URL"),
  });
}

function getLocalReservationPath(reservationPath) {
  return reservationPath.startsWith("/")
    ? path.join(process.cwd(), "public", reservationPath)
    : path.resolve(process.cwd(), reservationPath);
}

async function readJsonReservations(jsonUrl) {
  if (/^https?:\/\//i.test(jsonUrl)) {
    const response = await fetch(jsonUrl);
    if (!response.ok) {
      throw new Error(`No se pudo descargar JSON de reservas (${response.status}).`);
    }
    return response.json();
  }

  return JSON.parse(await readFile(getLocalReservationPath(jsonUrl), "utf8"));
}

async function loadReservationsForSource(source) {
  if (source === "googleSheets") {
    const sheetUrl = getEnvValue("GOOGLE_SHEET_URL", "VITE_GOOGLE_SHEET_URL");
    if (!sheetUrl) {
      throw new Error("Falta configurar GOOGLE_SHEET_URL o VITE_GOOGLE_SHEET_URL.");
    }

    const response = await fetch(sheetUrl);
    if (!response.ok) {
      throw new Error(`No se pudo descargar Google Sheets (${response.status}).`);
    }

    return normalizeReservationRecords(parseCsv(await response.text()));
  }

  const jsonUrl =
    source === "json"
      ? getEnvValue("RESERVATION_JSON_URL", "VITE_RESERVATION_JSON_URL", "/demo-reservations.json")
      : "/demo-reservations.json";
  const payload = await readJsonReservations(jsonUrl);

  if (!Array.isArray(payload)) {
    throw new Error("El JSON de reservas debe ser un array.");
  }

  return normalizeReservationRecords(payload);
}

function logReservationLoad({ source, reservations, error, forceLog = false }) {
  const signature = JSON.stringify({
    source,
    count: reservations.length,
    error: error || null,
  });

  if (!forceLog && signature === lastLogSignature) {
    return;
  }

  lastLogSignature = signature;
  console.log(`[Reservations] Source: ${source}`);

  if (error) {
    const prefix =
      source === "googleSheets"
        ? "[Reservations] Google Sheets fetch failed"
        : "[Reservations] Load failed";
    console.warn(`${prefix}: ${error}`);
    return;
  }

  console.log(`[Reservations] Loaded ${reservations.length} reservations`);
}

export async function refreshReservations({ forceLog = false } = {}) {
  const source = getConfiguredSource();
  const key = getConfigKey();

  try {
    const reservations = await loadReservationsForSource(source);
    cache = {
      key,
      source,
      reservations,
      loadedAtMs: Date.now(),
      lastReservationRefreshAt: new Date().toISOString(),
      reservationLoadError: null,
    };
    logReservationLoad({ source, reservations, forceLog });
    return reservations;
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Error desconocido al cargar reservas.";
    cache = {
      key,
      source,
      reservations: [],
      loadedAtMs: Date.now(),
      lastReservationRefreshAt: new Date().toISOString(),
      reservationLoadError: message,
    };
    logReservationLoad({ source, reservations: [], error: message, forceLog: true });
    throw error;
  }
}

export async function getReservations({ forceRefresh = false } = {}) {
  const key = getConfigKey();
  const cacheAgeSeconds = (Date.now() - cache.loadedAtMs) / 1000;
  const isCacheValid =
    cache.key === key &&
    cache.loadedAtMs > 0 &&
    cacheAgeSeconds < getReservationCacheSeconds();

  if (!forceRefresh && isCacheValid) {
    if (cache.reservationLoadError) {
      throw new Error(cache.reservationLoadError);
    }
    return cache.reservations;
  }

  loadingPromise ??= refreshReservations();

  try {
    return await loadingPromise;
  } finally {
    loadingPromise = undefined;
  }
}

export async function forceRefreshReservations() {
  return getReservations({ forceRefresh: true });
}

export function getReservationDiagnostics() {
  return {
    reservationSource: getConfiguredSource(),
    reservationsLoaded: cache.reservations.length,
    lastReservationRefreshAt: cache.lastReservationRefreshAt,
    reservationLoadError: cache.reservationLoadError,
  };
}

export function getReservationDebug() {
  return {
    source: getConfiguredSource(),
    count: cache.reservations.length,
    reservations: cache.reservations.slice(0, 10).map((reservation) => ({
      reservationCode: reservation.reservationCode,
      name: reservation.name,
      plate: reservation.plate,
      parkingValid: reservation.parkingValid,
      room: reservation.room,
    })),
  };
}
