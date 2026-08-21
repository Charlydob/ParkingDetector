import type { Detection } from "../types/detection";
import type { Reservation, ReservationSourceName } from "../types/reservation";
import { getBackendUrl, validateBackendUrl } from "./backendConfigService";

export interface ReservationMapping {
  reservationCode: string;
  name: string;
  email: string;
  plate: string;
  parkingValid: string;
  room: string;
  arrivalAt: string;
  departureAt: string;
  checkInAt: string;
  checkOutAt: string;
  nights: string;
  reservationStatus: string;
  parkingStartAt: string;
  parkingEndAt: string;
  customFields?: Array<{
    internalName: string;
    externalField: string;
  }>;
}

export interface JsonAuthSettings {
  type: "none" | "bearer" | "apiKey" | "basic";
  bearerToken?: string;
  apiKeyHeader?: string;
  apiKeyValue?: string;
  basicUsername?: string;
  basicPassword?: string;
  configured?: boolean;
}

export interface ReservationSourcePreview {
  source?: ReservationSourceName;
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

export interface BackendStatus {
  running: boolean;
  backendOnline: boolean;
  frigateConnected: boolean;
  frigateBaseUrl: string;
  frigatePollIntervalMs: number;
  lastPollAt?: string | null;
  lastEventProcessed?: string | null;
  frigateLastEvent?: string | null;
  frigateVersion?: string | null;
  reservationSource: ReservationSourceName;
  reservationsLoaded: number;
  lastReservationRefreshAt?: string | null;
  reservationLoadError?: string | null;
  stripeConfigured: boolean;
  activePlates?: number;
  presentPlates?: number;
  assignedPlates?: number;
}

export interface DeleteDetectionResult {
  success: boolean;
  deletedId: string;
}

export interface CheckInResult {
  id?: string;
  reservationCode: string;
  fullName: string;
  checkInAt: string;
}

export interface IntegrationSettings {
  reservations: {
    source: ReservationSourceName;
    mapping: ReservationMapping;
    googleSheets: {
      connected: boolean;
      csvUrl: string;
    };
    jsonFeed: {
      connected: boolean;
      url: string;
      jsonPath: string;
      auth: JsonAuthSettings;
    };
    reservationWebhook: {
      connected: boolean;
      urlPath: string;
      headerName: string;
      secretConfigured: boolean;
    };
    sourceDiagnostics: {
      source?: ReservationSourceName;
      recordsFound?: number;
      detectedFields?: string[];
      detectedFieldCount?: number;
      sampleRecord?: Record<string, unknown>;
      sampleNormalized?: Reservation;
      lastRefresh?: string | null;
      lastPayloadReceived?: boolean;
      lastReceivedAt?: string | null;
      lastError?: string | null;
    };
  };
  stripe: {
    connected: boolean;
    secretKeyMasked: string;
    webhookSecretConfigured: boolean;
  };
  frigate: {
    connected?: boolean;
    baseUrl: string;
    pollIntervalMs: number;
    lastPollAt?: string | null;
    lastEvent?: string | null;
    version?: string | null;
  };
  backend?: { online: boolean };
  firebase?: { connected: boolean };
  reservationDiagnostics?: {
    reservationsLoaded: number;
    lastReservationRefreshAt?: string | null;
    reservationLoadError?: string | null;
    reservationSourceDiagnostics?: IntegrationSettings["reservations"]["sourceDiagnostics"];
  };
}

interface ReservationDebugPayload {
  source: ReservationSourceName;
  count: number;
  reservations: Reservation[];
  reservationLoadError?: string | null;
  lastReservationRefreshAt?: string | null;
}

export const DEFAULT_RESERVATION_MAPPING: ReservationMapping = {
  reservationCode: "reservationCode",
  name: "name",
  email: "email",
  plate: "plate",
  parkingValid: "parkingValid",
  room: "room",
  arrivalAt: "arrivalAt",
  departureAt: "departureAt",
  checkInAt: "checkInAt",
  checkOutAt: "checkOutAt",
  nights: "nights",
  reservationStatus: "reservationStatus",
  parkingStartAt: "parkingStartAt",
  parkingEndAt: "parkingEndAt",
  customFields: [],
};

const DEFAULT_JSON_AUTH: JsonAuthSettings = {
  type: "none",
  apiKeyHeader: "x-api-key",
  configured: false,
};

function normalizeIntegrationSettings(payload: IntegrationSettings): IntegrationSettings {
  const reservations = payload.reservations || {};
  const mapping = reservations.mapping || {};
  const jsonFeed = reservations.jsonFeed || {};
  const reservationWebhook = reservations.reservationWebhook || {};

  return {
    ...payload,
    reservations: {
      source: reservations.source || "demo",
      mapping: {
        ...DEFAULT_RESERVATION_MAPPING,
        ...mapping,
        customFields: mapping.customFields ?? [],
      },
      googleSheets: {
        connected: Boolean(reservations.googleSheets?.connected),
        csvUrl: reservations.googleSheets?.csvUrl || "",
      },
      jsonFeed: {
        connected: Boolean(jsonFeed.connected),
        url: jsonFeed.url || "",
        jsonPath: jsonFeed.jsonPath || "",
        auth: {
          ...DEFAULT_JSON_AUTH,
          ...jsonFeed.auth,
        },
      },
      reservationWebhook: {
        connected: Boolean(reservationWebhook.connected),
        urlPath: reservationWebhook.urlPath || "/api/reservations/webhook",
        headerName: reservationWebhook.headerName || "x-parking-detector-secret",
        secretConfigured: Boolean(reservationWebhook.secretConfigured),
      },
      sourceDiagnostics: reservations.sourceDiagnostics || {},
    },
    stripe: {
      connected: Boolean(payload.stripe?.connected),
      secretKeyMasked: payload.stripe?.secretKeyMasked || "",
      webhookSecretConfigured: Boolean(payload.stripe?.webhookSecretConfigured),
    },
    frigate: {
      baseUrl: payload.frigate?.baseUrl || "",
      pollIntervalMs: payload.frigate?.pollIntervalMs || 5000,
      connected: payload.frigate?.connected,
      lastPollAt: payload.frigate?.lastPollAt,
      lastEvent: payload.frigate?.lastEvent,
      version: payload.frigate?.version,
    },
    backend: payload.backend,
    firebase: payload.firebase,
    reservationDiagnostics: payload.reservationDiagnostics,
  };
}

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${getBackendUrl()}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });

  const payload = (await response.json().catch(() => ({}))) as { error?: string };

  if (!response.ok) {
    throw new Error(payload.error || `Backend request failed (${response.status}).`);
  }

  return payload as T;
}

export async function getBackendStatus(): Promise<BackendStatus> {
  return requestJson<BackendStatus>("/api/status");
}

export async function testBackendConnection(url: string): Promise<BackendStatus> {
  const normalizedUrl = validateBackendUrl(url);
  const response = await fetch(`${normalizedUrl}/api/status`, {
    headers: {
      "Content-Type": "application/json",
    },
  });
  const payload = (await response.json().catch(() => ({}))) as BackendStatus & {
    error?: string;
  };

  if (!response.ok) {
    throw new Error(payload.error || `HTTP ${response.status}`);
  }

  if (!payload.running) {
    throw new Error("Backend did not report running: true.");
  }

  return payload;
}

export async function getIntegrationSettings(): Promise<IntegrationSettings> {
  return normalizeIntegrationSettings(
    await requestJson<IntegrationSettings>("/api/settings/integrations"),
  );
}

export async function refreshBackendReservations(): Promise<ReservationDebugPayload> {
  return requestJson<ReservationDebugPayload>("/api/reservations/refresh", {
    method: "POST",
  });
}

export async function getBackendReservationDebug(): Promise<ReservationDebugPayload> {
  return requestJson<ReservationDebugPayload>("/api/reservations/debug");
}

export async function testGoogleSheets(csvUrl: string): Promise<{ reservationsLoaded: number }> {
  return requestJson("/api/settings/google-sheets/test", {
    method: "POST",
    body: JSON.stringify({ csvUrl }),
  });
}

export async function saveGoogleSheets(csvUrl: string): Promise<IntegrationSettings> {
  return normalizeIntegrationSettings(
    await requestJson<IntegrationSettings>("/api/settings/google-sheets", {
      method: "POST",
      body: JSON.stringify({ csvUrl }),
    }),
  );
}

export async function disconnectGoogleSheets(): Promise<IntegrationSettings> {
  return normalizeIntegrationSettings(
    await requestJson<IntegrationSettings>("/api/settings/google-sheets", { method: "DELETE" }),
  );
}

export async function testJsonFeed(
  url: string,
  jsonPath: string,
  auth: JsonAuthSettings,
): Promise<{ reservationsLoaded: number; preview: ReservationSourcePreview }> {
  return requestJson("/api/settings/json-feed/test", {
    method: "POST",
    body: JSON.stringify({ url, jsonPath, auth }),
  });
}

export async function saveJsonFeed(
  url: string,
  jsonPath: string,
  auth: JsonAuthSettings,
): Promise<IntegrationSettings> {
  return normalizeIntegrationSettings(
    await requestJson<IntegrationSettings>("/api/settings/json-feed", {
      method: "POST",
      body: JSON.stringify({ url, jsonPath, auth }),
    }),
  );
}

export async function disconnectJsonFeed(): Promise<IntegrationSettings> {
  return normalizeIntegrationSettings(
    await requestJson<IntegrationSettings>("/api/settings/json-feed", { method: "DELETE" }),
  );
}

export async function saveReservationWebhook(
  headerName: string,
  secret: string,
  jsonPath: string,
): Promise<IntegrationSettings> {
  return normalizeIntegrationSettings(
    await requestJson<IntegrationSettings>("/api/settings/reservation-webhook", {
      method: "POST",
      body: JSON.stringify({ headerName, secret, jsonPath }),
    }),
  );
}

export async function disconnectReservationWebhook(): Promise<IntegrationSettings> {
  return normalizeIntegrationSettings(
    await requestJson<IntegrationSettings>("/api/settings/reservation-webhook", {
      method: "DELETE",
    }),
  );
}

export async function previewReservationSource(
  source?: ReservationSourceName,
): Promise<ReservationSourcePreview> {
  return requestJson("/api/settings/reservation-source/preview", {
    method: "POST",
    body: JSON.stringify({ source }),
  });
}

export async function saveReservationMapping(
  mapping: ReservationMapping,
): Promise<IntegrationSettings> {
  return normalizeIntegrationSettings(
    await requestJson<IntegrationSettings>("/api/settings/reservation-mapping", {
      method: "POST",
      body: JSON.stringify({ mapping }),
    }),
  );
}

export async function testReservationMapping(
  mapping: ReservationMapping,
): Promise<ReservationSourcePreview> {
  return requestJson("/api/settings/reservation-mapping/test", {
    method: "POST",
    body: JSON.stringify({ mapping }),
  });
}

export async function testStripe(secretKey: string): Promise<{ connected: boolean }> {
  return requestJson("/api/settings/stripe/test", {
    method: "POST",
    body: JSON.stringify({ secretKey }),
  });
}

export async function saveStripe(
  secretKey: string,
  webhookSecret: string,
): Promise<IntegrationSettings["stripe"]> {
  return requestJson("/api/settings/stripe", {
    method: "POST",
    body: JSON.stringify({ secretKey, webhookSecret }),
  });
}

export async function disconnectStripe(): Promise<IntegrationSettings["stripe"]> {
  return requestJson("/api/settings/stripe", { method: "DELETE" });
}

export async function testFrigate(baseUrl: string): Promise<{ connected: boolean; version?: string | null }> {
  return requestJson("/api/settings/frigate/test", {
    method: "POST",
    body: JSON.stringify({ baseUrl }),
  });
}

export async function saveFrigate(
  baseUrl: string,
  pollIntervalMs: number,
): Promise<IntegrationSettings["frigate"]> {
  return requestJson("/api/settings/frigate", {
    method: "POST",
    body: JSON.stringify({ baseUrl, pollIntervalMs }),
  });
}

export async function deleteDetectionPermanently(
  detectionId: string,
): Promise<DeleteDetectionResult> {
  const backendUrl = getBackendUrl();
  console.info("[Delete] Backend URL:", backendUrl);
  console.info("[Delete] Detection ID:", detectionId);

  const response = await fetch(`${backendUrl}/api/detections/${encodeURIComponent(detectionId)}`, {
    method: "DELETE",
    headers: {
      "Content-Type": "application/json",
    },
  });
  console.info("[Delete] HTTP status:", response.status);

  const payload = (await response.json().catch(() => ({}))) as DeleteDetectionResult & {
    error?: string;
  };

  if (!response.ok) {
    throw new Error(payload.error || `Backend request failed (${response.status}).`);
  }

  return payload;
}

export async function simulateCheckIn(
  reservationCode: string,
  fullName: string,
): Promise<CheckInResult> {
  return requestJson<CheckInResult>("/api/test-checkin", {
    method: "POST",
    body: JSON.stringify({ reservationCode, fullName }),
  });
}

export function evidenceUrlFromPath(localPath?: string): string | undefined {
  if (!localPath) {
    return undefined;
  }

  const filename = localPath.split(/[\\/]/).pop();
  if (!filename) {
    return undefined;
  }

  const collection = localPath.includes("/clips/") || localPath.includes("\\clips\\")
    ? "clips"
    : "snapshots";

  return `${getBackendUrl()}/api/evidence/${collection}/${encodeURIComponent(filename)}`;
}
