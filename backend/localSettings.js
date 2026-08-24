import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { RESERVATION_COLUMN_MAPPING } from "../shared/reservationMapping.mjs";
import { parseConfigNumber } from "../shared/detectionLogic.mjs";

const DATA_DIR = path.resolve(process.cwd(), process.env.DATA_DIR || "backend/data");
const SETTINGS_PATH = path.join(DATA_DIR, "local-settings.json");
const VALID_SOURCES = new Set(["demo", "googleSheets", "json", "reservationWebhook"]);
const DEFAULT_FRIGATE_BASE_URL = "http://localhost:5000";
const DEFAULT_POLL_INTERVAL_MS = 5000;
const DEFAULT_RESERVATION_WEBHOOK_HEADER = "x-hotel-automation-secret";

let settings = {};

function cleanString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function pickSource(value) {
  return VALID_SOURCES.has(value) ? value : "demo";
}

function maskSecret(value) {
  const secret = cleanString(value);

  if (!secret) {
    return "";
  }

  return `${"•".repeat(10)}${secret.slice(-4)}`;
}

function cleanMapping(mapping = {}) {
  return {
    ...Object.fromEntries(
      Object.entries(RESERVATION_COLUMN_MAPPING).map(([key, defaultValue]) => [
        key,
        cleanString(mapping[key]) || defaultValue,
      ]),
    ),
    customFields: Array.isArray(mapping.customFields)
      ? mapping.customFields
          .map((field) => ({
            internalName: cleanString(field?.internalName),
            externalField: cleanString(field?.externalField),
          }))
          .filter((field) => field.internalName && field.externalField)
      : [],
  };
}

function cleanJsonAuth(auth = {}) {
  const type = ["none", "bearer", "apiKey", "basic"].includes(auth.type)
    ? auth.type
    : "none";

  return {
    type,
    bearerToken: cleanString(auth.bearerToken),
    apiKeyHeader: cleanString(auth.apiKeyHeader) || "x-api-key",
    apiKeyValue: cleanString(auth.apiKeyValue),
    basicUsername: cleanString(auth.basicUsername),
    basicPassword: cleanString(auth.basicPassword),
  };
}

function stripEmpty(value) {
  if (Array.isArray(value)) {
    return value.map(stripEmpty);
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .map(([key, fieldValue]) => [key, stripEmpty(fieldValue)])
        .filter(([, fieldValue]) => {
          if (fieldValue === undefined || fieldValue === null || fieldValue === "") {
            return false;
          }

          return !(typeof fieldValue === "object" && Object.keys(fieldValue).length === 0);
        }),
    );
  }

  return value;
}

async function saveSettings() {
  await mkdir(path.dirname(SETTINGS_PATH), { recursive: true });
  await writeFile(SETTINGS_PATH, `${JSON.stringify(stripEmpty(settings), null, 2)}\n`);
}

export async function loadLocalSettings() {
  try {
    settings = JSON.parse(await readFile(SETTINGS_PATH, "utf8"));
  } catch (error) {
    if (error.code !== "ENOENT") {
      throw error;
    }

    settings = {};
  }

  return settings;
}

export function getLocalSettings() {
  return settings;
}

export async function updateLocalSettings(patch) {
  settings = {
    ...settings,
    ...patch,
    googleSheets: {
      ...settings.googleSheets,
      ...patch.googleSheets,
    },
    jsonFeed: {
      ...settings.jsonFeed,
      ...patch.jsonFeed,
    },
    reservationWebhook: {
      ...settings.reservationWebhook,
      ...patch.reservationWebhook,
    },
    reservationSourceDiagnostics: {
      ...settings.reservationSourceDiagnostics,
      ...patch.reservationSourceDiagnostics,
    },
    stripe: {
      ...settings.stripe,
      ...patch.stripe,
    },
    frigate: {
      ...settings.frigate,
      ...patch.frigate,
    },
  };

  if (patch.reservationMapping) {
    settings.reservationMapping = cleanMapping(patch.reservationMapping);
  }

  await saveSettings();
  return settings;
}

export async function disconnectReservationSource(source) {
  if (source === "googleSheets") {
    settings.googleSheets = {};
  }

  if (source === "json") {
    settings.jsonFeed = {};
  }

  if (source === "reservationWebhook") {
    settings.reservationWebhook = {};
  }

  if (settings.reservationSource === source) {
    settings.reservationSource = "demo";
  }

  await saveSettings();
  return settings;
}

export async function disconnectStripeSettings() {
  settings.stripe = {};
  await saveSettings();
  return settings;
}

export function getReservationSettings() {
  const localSource = cleanString(settings.reservationSource);
  const envSource = cleanString(
    process.env.RESERVATION_SOURCE || process.env.VITE_RESERVATION_SOURCE,
  );

  return {
    source: pickSource(localSource || envSource || "demo"),
    googleSheetUrl:
      cleanString(settings.googleSheets?.csvUrl) ||
      cleanString(process.env.GOOGLE_SHEET_URL || process.env.VITE_GOOGLE_SHEET_URL),
    jsonUrl:
      cleanString(settings.jsonFeed?.url) ||
      cleanString(
        process.env.RESERVATION_JSON_URL ||
          process.env.VITE_RESERVATION_JSON_URL ||
          "/demo-reservations.json",
      ),
    jsonPath: cleanString(settings.jsonFeed?.jsonPath),
    jsonAuth: cleanJsonAuth(settings.jsonFeed?.auth),
    reservationWebhook: {
      headerName:
        cleanString(settings.reservationWebhook?.headerName) ||
        DEFAULT_RESERVATION_WEBHOOK_HEADER,
      secret: cleanString(settings.reservationWebhook?.secret),
    },
    mapping: cleanMapping(settings.reservationMapping),
  };
}

export function getStripeSettings() {
  return {
    secretKey: cleanString(settings.stripe?.secretKey) || cleanString(process.env.STRIPE_SECRET_KEY),
    webhookSecret:
      cleanString(settings.stripe?.webhookSecret) ||
      cleanString(process.env.STRIPE_WEBHOOK_SECRET),
  };
}

export function getFrigateSettings() {
  const pollIntervalMs = parseConfigNumber(
    settings.frigate?.pollIntervalMs ?? process.env.FRIGATE_POLL_INTERVAL_MS,
    DEFAULT_POLL_INTERVAL_MS,
  );

  return {
    baseUrl:
      cleanString(settings.frigate?.baseUrl) ||
      cleanString(process.env.FRIGATE_BASE_URL) ||
      DEFAULT_FRIGATE_BASE_URL,
    pollIntervalMs,
  };
}

export function getPublicIntegrationSettings(extra = {}) {
  const reservationSettings = getReservationSettings();
  const stripeSettings = getStripeSettings();
  const frigateSettings = getFrigateSettings();

  return {
    reservations: {
      source: reservationSettings.source,
      mapping: reservationSettings.mapping,
      googleSheets: {
        connected:
          reservationSettings.source === "googleSheets" &&
          Boolean(reservationSettings.googleSheetUrl),
        csvUrl: reservationSettings.googleSheetUrl,
      },
      jsonFeed: {
        connected: reservationSettings.source === "json" && Boolean(reservationSettings.jsonUrl),
        url: reservationSettings.jsonUrl,
        jsonPath: reservationSettings.jsonPath,
        auth: {
          type: reservationSettings.jsonAuth.type,
          apiKeyHeader: reservationSettings.jsonAuth.apiKeyHeader,
          configured: Boolean(
            reservationSettings.jsonAuth.bearerToken ||
              reservationSettings.jsonAuth.apiKeyValue ||
              reservationSettings.jsonAuth.basicUsername ||
              reservationSettings.jsonAuth.basicPassword,
          ),
        },
      },
      reservationWebhook: {
        connected: reservationSettings.source === "reservationWebhook",
        urlPath: "/api/reservations/webhook",
        headerName: reservationSettings.reservationWebhook.headerName,
        secretConfigured: Boolean(reservationSettings.reservationWebhook.secret),
      },
      sourceDiagnostics: settings.reservationSourceDiagnostics || {},
    },
    stripe: {
      connected: Boolean(stripeSettings.secretKey && stripeSettings.webhookSecret),
      secretKeyMasked: maskSecret(stripeSettings.secretKey),
      webhookSecretConfigured: Boolean(stripeSettings.webhookSecret),
    },
    frigate: {
      baseUrl: frigateSettings.baseUrl,
      pollIntervalMs: frigateSettings.pollIntervalMs,
      ...extra.frigate,
    },
  };
}
