import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { parseCsv } from "../shared/csv.mjs";
import {
  buildReservationSourcePreview,
  extractReservationRecords,
  normalizeReservationRecords,
} from "../shared/reservationRecordMapper.mjs";
import { parseConfigNumber } from "../shared/detectionLogic.mjs";
import {
  getLocalSettings,
  getReservationSettings,
  updateLocalSettings,
} from "./localSettings.js";

const WEBHOOK_PAYLOAD_PATH = path.resolve(
  process.cwd(),
  "backend/data/reservation-webhook-payload.json",
);

let cache = {
  key: "",
  source: "demo",
  reservations: [],
  loadedAtMs: 0,
  lastReservationRefreshAt: null,
  reservationLoadError: null,
  sourcePreview: undefined,
};
let loadingPromise;
let lastLogSignature = "";

function getConfiguredSource() {
  return getReservationSettings().source;
}

function getReservationCacheSeconds() {
  return parseConfigNumber(process.env.RESERVATION_CACHE_SECONDS, 30);
}

function getConfigKey() {
  const settings = getReservationSettings();

  return JSON.stringify({
    source: settings.source,
    googleSheetUrl: settings.googleSheetUrl,
    jsonUrl: settings.jsonUrl,
    mapping: settings.mapping,
  });
}

function getLocalReservationPath(reservationPath) {
  return reservationPath.startsWith("/")
    ? path.join(process.cwd(), "public", reservationPath)
    : path.resolve(process.cwd(), reservationPath);
}

async function readJsonReservations(jsonUrl) {
  const settings = getReservationSettings();
  const jsonPath = jsonUrl === "/demo-reservations.json" ? "" : settings.jsonPath;
  const headers = createJsonAuthHeaders(settings.jsonAuth);

  if (/^https?:\/\//i.test(jsonUrl)) {
    const response = await fetch(jsonUrl, { headers });
    if (!response.ok) {
      throw new Error(`Could not download reservation JSON (${response.status}).`);
    }
    return extractReservationRecords(await response.json(), jsonPath);
  }

  return extractReservationRecords(
    JSON.parse(await readFile(getLocalReservationPath(jsonUrl), "utf8")),
    jsonPath,
  );
}

function createJsonAuthHeaders(auth) {
  if (!auth || auth.type === "none") {
    return {};
  }

  if (auth.type === "bearer" && auth.bearerToken) {
    return { Authorization: `Bearer ${auth.bearerToken}` };
  }

  if (auth.type === "apiKey" && auth.apiKeyHeader && auth.apiKeyValue) {
    return { [auth.apiKeyHeader]: auth.apiKeyValue };
  }

  if (auth.type === "basic" && (auth.basicUsername || auth.basicPassword)) {
    return {
      Authorization: `Basic ${Buffer.from(
        `${auth.basicUsername}:${auth.basicPassword}`,
      ).toString("base64")}`,
    };
  }

  return {};
}

async function readWebhookReservations() {
  try {
    const settings = getReservationSettings();
    const payload = JSON.parse(await readFile(WEBHOOK_PAYLOAD_PATH, "utf8"));
    return extractReservationRecords(payload, settings.jsonPath);
  } catch (error) {
    if (error.code === "ENOENT") {
      return [];
    }

    throw error;
  }
}

async function updateSourcePreview(source, records, mapping) {
  const preview = buildReservationSourcePreview(records, mapping);

  await updateLocalSettings({
    reservationSourceDiagnostics: {
      source,
      recordsFound: preview.reservationsFound,
      detectedFields: preview.detectedFields,
      detectedFieldCount: preview.detectedFieldCount,
      sampleRecord: preview.sampleRecord,
      sampleNormalized: preview.sampleNormalized,
      lastRefresh: new Date().toISOString(),
      lastError: null,
    },
  });

  return preview;
}

export async function saveReservationWebhookPayload(payload) {
  await mkdir(path.dirname(WEBHOOK_PAYLOAD_PATH), { recursive: true });
  await writeFile(WEBHOOK_PAYLOAD_PATH, `${JSON.stringify(payload, null, 2)}\n`, "utf8");

  const settings = getReservationSettings();
  const records = extractReservationRecords(payload, settings.jsonPath);
  const preview = await updateSourcePreview("reservationWebhook", records, settings.mapping);

  await updateLocalSettings({
    reservationSourceDiagnostics: {
      lastPayloadReceived: true,
      lastReceivedAt: new Date().toISOString(),
    },
  });

  return preview;
}

async function loadReservationsForSource(source, overrides = {}) {
  const settings = getReservationSettings();
  const googleSheetUrl = overrides.googleSheetUrl ?? settings.googleSheetUrl;
  const jsonUrl = overrides.jsonUrl ?? settings.jsonUrl;
  const mapping = overrides.mapping ?? settings.mapping;

  if (source === "googleSheets") {
    const sheetUrl = googleSheetUrl;
    if (!sheetUrl) {
      throw new Error("Google Sheets CSV URL is not configured.");
    }

    const response = await fetch(sheetUrl);
    if (!response.ok) {
      throw new Error(`Could not download Google Sheets CSV (${response.status}).`);
    }

    const records = parseCsv(await response.text());
    await updateSourcePreview(source, records, mapping);
    return normalizeReservationRecords(records, mapping);
  }

  if (source === "reservationWebhook") {
    const records = await readWebhookReservations();
    await updateSourcePreview(source, records, mapping);
    return normalizeReservationRecords(records, mapping);
  }

  const sourceJsonUrl = source === "json" ? jsonUrl : "/demo-reservations.json";
  const records = await readJsonReservations(sourceJsonUrl);
  await updateSourcePreview(source, records, mapping);
  return normalizeReservationRecords(records, mapping);
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
      sourcePreview: undefined,
    };
    logReservationLoad({ source, reservations, forceLog });
    return reservations;
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown error while loading reservations.";
    cache = {
      key,
      source,
      reservations: [],
      loadedAtMs: Date.now(),
      lastReservationRefreshAt: new Date().toISOString(),
      reservationLoadError: message,
    };
    await updateLocalSettings({
      reservationSourceDiagnostics: {
        lastError: message,
      },
    });
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

export async function testReservationConnection(source, overrides = {}) {
  const settings = getReservationSettings();

  let records;
  if (source === "googleSheets") {
    records = await loadRawGoogleSheetRecords(overrides.googleSheetUrl, settings.mapping);
  } else if (source === "reservationWebhook") {
    records = await readWebhookReservations();
  } else {
    records = await loadRawJsonRecords(overrides, settings);
  }

  const preview = buildReservationSourcePreview(records, settings.mapping);

  return {
    source,
    reservationsLoaded: normalizeReservationRecords(records, settings.mapping).length,
    reservations: normalizeReservationRecords(records, settings.mapping).slice(0, 5),
    preview,
  };
}

async function loadRawGoogleSheetRecords(googleSheetUrl, mapping) {
  const sheetUrl = googleSheetUrl || getReservationSettings().googleSheetUrl;
  if (!sheetUrl) {
    throw new Error("Google Sheets CSV URL is not configured.");
  }

  const response = await fetch(sheetUrl);
  if (!response.ok) {
    throw new Error(`Could not download Google Sheets CSV (${response.status}).`);
  }

  return parseCsv(await response.text());
}

async function loadRawJsonRecords(overrides = {}, settings = getReservationSettings()) {
  const jsonUrl = overrides.jsonUrl ?? settings.jsonUrl;
  const jsonPath = overrides.jsonPath ?? settings.jsonPath;
  const auth = overrides.auth ?? settings.jsonAuth;
  const headers = createJsonAuthHeaders(auth);

  if (/^https?:\/\//i.test(jsonUrl)) {
    const response = await fetch(jsonUrl, { headers });
    if (!response.ok) {
      throw new Error(`Could not download reservation JSON (${response.status}).`);
    }
    return extractReservationRecords(await response.json(), jsonPath);
  }

  return extractReservationRecords(
    JSON.parse(await readFile(getLocalReservationPath(jsonUrl), "utf8")),
    jsonPath,
  );
}

export async function previewReservationSource(source = getReservationSettings().source) {
  const settings = getReservationSettings();
  let records;

  if (source === "googleSheets") {
    records = await loadRawGoogleSheetRecords(settings.googleSheetUrl, settings.mapping);
  } else if (source === "reservationWebhook") {
    records = await readWebhookReservations();
  } else {
    records = await loadRawJsonRecords({}, settings);
  }

  return {
    source,
    ...buildReservationSourcePreview(records, settings.mapping),
  };
}

export async function testReservationMapping(mapping) {
  const settings = getReservationSettings();
  let records;

  if (settings.source === "googleSheets") {
    records = await loadRawGoogleSheetRecords(settings.googleSheetUrl, mapping);
  } else if (settings.source === "reservationWebhook") {
    records = await readWebhookReservations();
  } else {
    records = await loadRawJsonRecords({}, settings);
  }

  return buildReservationSourcePreview(records, mapping);
}

export function getReservationDiagnostics() {
  const settings = getReservationSettings();
  const localSettings = getLocalSettings();

  return {
    reservationSource: settings.source,
    reservationsLoaded: cache.reservations.length,
    lastReservationRefreshAt: cache.lastReservationRefreshAt,
    reservationLoadError: cache.reservationLoadError,
    reservationMapping: settings.mapping,
    reservationSourceDiagnostics: localSettings.reservationSourceDiagnostics || {},
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
