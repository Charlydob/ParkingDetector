import type { Detection } from "../types/detection";
import type { CheckoutOverview, KeyIdentifier, Room } from "../types/checkout";
import type { ModuleDefinition, ModuleId, TenantRole } from "../types/modules";
import type { Reservation, ReservationSourceName } from "../types/reservation";
import type {
  AuthSession,
  Tenant,
  TenantMember,
  TenantMembership,
  UserInvitation,
  UserProfile,
} from "../types/tenant";
import { getBackendUrl, validateBackendUrl } from "./backendConfigService";

let selectedTenantId: string | undefined;
let selectedTenantSlug: string | undefined;

export function setSelectedTenantId(tenantId?: string) {
  selectedTenantId = tenantId;
}

export function setSelectedTenantSlug(slug?: string) {
  selectedTenantSlug = slug;
}

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

export interface AppVersion {
  version: string;
  sha?: string;
  environment: string;
}

export interface PublicCheckoutTarget {
  key: {
    id: string;
    type: "qr" | "nfc" | "rfid";
    label: string;
  };
  room: {
    id: string;
    number: string;
    name?: string;
    status: string;
  };
  tenant: {
    name: string;
    slug: string;
  };
  attemptToken: string;
}

export class BackendRequestError extends Error {
  code?: string;
  status: number;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = "BackendRequestError";
    this.status = status;
    this.code = code;
  }
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
    cameras?: string[];
    lastPollAt?: string | null;
    lastEvent?: string | null;
    version?: string | null;
  };
  backend?: { online: boolean };
  database?: { connected: boolean };
  notifications?: {
    telegram: {
      enabled: boolean;
      chatId: string;
      chatTitle?: string;
      chatType?: string;
      connectedAt?: string;
      diagnostics?: {
        lastAttemptAt?: string;
        lastSuccessAt?: string;
        lastError?: string;
        httpStatus?: number;
        checkoutEventId?: string;
        room?: string;
        source?: string;
      };
    };
  };
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
        headerName: reservationWebhook.headerName || "x-hotel-automation-secret",
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
      cameras: payload.frigate?.cameras || [],
      connected: payload.frigate?.connected,
      lastPollAt: payload.frigate?.lastPollAt,
      lastEvent: payload.frigate?.lastEvent,
      version: payload.frigate?.version,
    },
    backend: payload.backend,
    database: payload.database,
    notifications: {
      telegram: {
        enabled: Boolean(payload.notifications?.telegram?.enabled),
        chatId: payload.notifications?.telegram?.chatId || "",
        chatTitle: payload.notifications?.telegram?.chatTitle || "",
        chatType: payload.notifications?.telegram?.chatType || "",
        connectedAt: payload.notifications?.telegram?.connectedAt || "",
        diagnostics: payload.notifications?.telegram?.diagnostics || {},
      },
    },
    reservationDiagnostics: payload.reservationDiagnostics,
  };
}

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  headers.set("Content-Type", "application/json");

  if (selectedTenantId) {
    headers.set("X-Tenant-Id", selectedTenantId);
  } else if (selectedTenantSlug) {
    headers.set("X-Tenant-Slug", selectedTenantSlug);
  }

  const response = await fetch(`${getBackendUrl()}${path}`, {
    ...init,
    headers,
    credentials: "include",
  });

  const payload = (await response.json().catch(() => ({}))) as { error?: string; code?: string };

  if (!response.ok) {
    throw new BackendRequestError(
      payload.error || `Backend request failed (${response.status}).`,
      response.status,
      payload.code,
    );
  }

  return payload as T;
}

async function requestPublicJson<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  headers.set("Content-Type", "application/json");

  const response = await fetch(`${getBackendUrl()}${path}`, {
    ...init,
    headers,
    credentials: "include",
  });

  const payload = (await response.json().catch(() => ({}))) as { error?: string; code?: string };

  if (!response.ok) {
    throw new BackendRequestError(
      payload.error || `Backend request failed (${response.status}).`,
      response.status,
      payload.code,
    );
  }

  return payload as T;
}

export async function getAuthSession(): Promise<AuthSession> {
  const session = await requestJson<AuthSession>("/api/auth/session");
  setSelectedTenantId(session.activeTenantId);
  return session;
}

export async function loginWithPassword(email: string, password: string): Promise<void> {
  await requestPublicJson("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
}

export async function logoutSession(): Promise<void> {
  await requestPublicJson("/api/auth/logout", {
    method: "POST",
    body: JSON.stringify({}),
  });
  setSelectedTenantId(undefined);
  setSelectedTenantSlug(undefined);
}

export async function getModuleRegistry(): Promise<ModuleDefinition[]> {
  return requestJson<ModuleDefinition[]>("/api/modules");
}

export async function getBackendStatus(): Promise<BackendStatus> {
  return requestJson<BackendStatus>("/api/status");
}

export async function getAppVersion(): Promise<AppVersion> {
  return requestPublicJson<AppVersion>("/api/version");
}

export async function testBackendConnection(url: string): Promise<BackendStatus> {
  const normalizedUrl = validateBackendUrl(url);
  const response = await fetch(`${normalizedUrl}/api/status`, {
    headers: {
      "Content-Type": "application/json",
    },
    credentials: "include",
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

export async function saveNotifications(settings: {
  telegram: { enabled: boolean; chatId: string };
}): Promise<IntegrationSettings> {
  return normalizeIntegrationSettings(
    await requestJson<IntegrationSettings>("/api/settings/notifications", {
      method: "POST",
      body: JSON.stringify(settings),
    }),
  );
}

export async function generateTelegramPairingCode(): Promise<{
  code: string;
  expiresAt: string;
  tenant: { id: string; name: string; slug: string };
}> {
  return requestJson("/api/integrations/telegram/pairing-code", {
    method: "POST",
    body: JSON.stringify({}),
  });
}

export async function disconnectTelegram(): Promise<IntegrationSettings> {
  return normalizeIntegrationSettings(
    await requestJson<IntegrationSettings>("/api/integrations/telegram/disconnect", {
      method: "POST",
      body: JSON.stringify({}),
    }),
  );
}

export async function testTelegramNotification(): Promise<{
  success: boolean;
  skipped: boolean;
  error?: string;
  httpStatus?: number;
  diagnostics?: NonNullable<IntegrationSettings["notifications"]>["telegram"]["diagnostics"];
}> {
  return requestJson("/api/integrations/telegram/test", {
    method: "POST",
    body: JSON.stringify({}),
  });
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
  cameras: string[] = [],
): Promise<IntegrationSettings["frigate"]> {
  return requestJson("/api/settings/frigate", {
    method: "POST",
    body: JSON.stringify({ baseUrl, pollIntervalMs, cameras }),
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
      ...authHeaders(),
    },
    credentials: "include",
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

function authHeaders(): Record<string, string> {
  return {
    ...(selectedTenantId ? { "X-Tenant-Id": selectedTenantId } : {}),
    ...(!selectedTenantId && selectedTenantSlug ? { "X-Tenant-Slug": selectedTenantSlug } : {}),
  };
}

export async function getParkingDetections(): Promise<Detection[]> {
  return requestJson<Detection[]>("/api/parking/detections");
}

export async function updateBackendDetectionReviewStatus(
  detectionId: string,
  reviewStatus: Detection["reviewStatus"],
): Promise<void> {
  await requestJson(`/api/parking/detections/${encodeURIComponent(detectionId)}/review`, {
    method: "PATCH",
    body: JSON.stringify({ reviewStatus }),
  });
}

export async function confirmBackendTemporalAssociation(
  detectionId: string,
  candidate: NonNullable<Detection["associationCandidates"]>[number],
): Promise<void> {
  await requestJson(`/api/parking/detections/${encodeURIComponent(detectionId)}/confirm`, {
    method: "POST",
    body: JSON.stringify({ candidate }),
  });
}

export async function getCheckoutOverview(): Promise<CheckoutOverview> {
  return requestJson<CheckoutOverview>("/api/checkout/overview");
}

export async function getCheckoutKeys(): Promise<KeyIdentifier[]> {
  return requestJson<KeyIdentifier[]>("/api/checkout/keys");
}

export async function createRoom(input: Partial<Room>): Promise<Room> {
  return requestJson<Room>("/api/checkout/rooms", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function createRoomsBulk(input: {
  numbers: string;
  createQr?: boolean;
  keyLabel?: string;
}): Promise<{
  created: Room[];
  skippedExisting: Array<{ id: string; number: string }>;
  duplicateInput: string[];
  keys: Array<KeyIdentifier & { qrDataUrl: string; checkoutUrl: string }>;
  summary: {
    created: number;
    skippedExisting: number;
    duplicateInput: number;
    keysCreated: number;
  };
}> {
  return requestJson("/api/checkout/rooms/bulk", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function updateRoom(roomId: string, input: Partial<Room>): Promise<Room> {
  return requestJson<Room>(`/api/checkout/rooms/${encodeURIComponent(roomId)}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export async function createCheckoutKey(input: {
  roomId: string;
  label?: string;
}): Promise<KeyIdentifier & { qrDataUrl: string; checkoutUrl: string }> {
  return requestJson("/api/checkout/keys", {
    method: "POST",
    body: JSON.stringify({ ...input, type: "qr" }),
  });
}

export async function createCheckoutKeysBulk(input: {
  label?: string;
  regenerateExisting?: boolean;
}): Promise<{
  created: KeyIdentifier[];
  regenerated: KeyIdentifier[];
  skippedExisting: Array<{ id: string; roomId: string; roomNumber: string; label: string }>;
  keys: Array<KeyIdentifier & { qrDataUrl: string; checkoutUrl: string }>;
  summary: {
    created: number;
    regenerated: number;
    skippedExisting: number;
    rooms: number;
  };
}> {
  return requestJson("/api/checkout/keys/bulk", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function updateCheckoutKey(
  keyId: string,
  input: Partial<KeyIdentifier> & { regenerate?: boolean },
): Promise<KeyIdentifier & { qrDataUrl: string; checkoutUrl: string }> {
  return requestJson(`/api/checkout/keys/${encodeURIComponent(keyId)}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export async function manualCheckout(roomId: string): Promise<{ duplicate: boolean }> {
  return requestJson("/api/checkout/manual", {
    method: "POST",
    body: JSON.stringify({ roomId }),
  });
}

export async function getPublicCheckoutTenant(slug: string): Promise<{
  tenantName: string;
  slug: string;
  enabled: boolean;
}> {
  return requestPublicJson(`/api/public/tenants/${encodeURIComponent(slug)}/checkout`);
}

export async function resolvePublicCheckout(token: string): Promise<PublicCheckoutTarget> {
  return requestPublicJson<PublicCheckoutTarget>(
    `/api/public/checkout/${encodeURIComponent(token)}`,
  );
}

export async function submitPublicCheckout(token: string, attemptToken: string): Promise<{
  success: boolean;
  duplicate: boolean;
  timestamp: string;
  room: { number: string };
}> {
  return requestPublicJson(`/api/public/checkout/${encodeURIComponent(token)}`, {
    method: "POST",
    body: JSON.stringify({ attemptToken }),
  });
}

export interface AdminTenantSummary extends Tenant {
  userCount: number;
  users: TenantMember[];
  invitations: UserInvitation[];
  modules: Record<ModuleId, boolean>;
  settingsSummary: {
    reservationSource: string;
    frigateBaseUrl: string;
    stripeConnected: boolean;
    telegramEnabled: boolean;
    rooms: number;
    keys: number;
    updatedAt?: string | null;
  };
}

export async function getAdminTenants(): Promise<AdminTenantSummary[]> {
  return requestJson<AdminTenantSummary[]>("/api/admin/tenants");
}

export async function createTenant(input: {
  name: string;
  slug: string;
  modules?: Partial<Record<ModuleId, boolean>>;
}): Promise<Tenant> {
  return requestJson<Tenant>("/api/admin/tenants", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function updateAdminTenant(
  tenantId: string,
  input: Partial<Tenant> & { displayName?: string },
): Promise<Tenant> {
  return requestJson<Tenant>(`/api/admin/tenants/${encodeURIComponent(tenantId)}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export async function deleteAdminTenant(tenantId: string): Promise<{ success: boolean }> {
  return requestJson<{ success: boolean }>(`/api/admin/tenants/${encodeURIComponent(tenantId)}`, {
    method: "DELETE",
  });
}

export async function getAdminTenantIntegrationSettings(
  tenantId: string,
): Promise<IntegrationSettings> {
  return normalizeIntegrationSettings(
    await requestJson<IntegrationSettings>(
      `/api/admin/tenants/${encodeURIComponent(tenantId)}/settings/integrations`,
    ),
  );
}

export async function updateAdminTenantIntegrationSettings(
  tenantId: string,
  patch: Record<string, unknown>,
): Promise<IntegrationSettings> {
  return normalizeIntegrationSettings(
    await requestJson<IntegrationSettings>(
      `/api/admin/tenants/${encodeURIComponent(tenantId)}/settings/integrations`,
      {
        method: "PATCH",
        body: JSON.stringify(patch),
      },
    ),
  );
}

export async function setAdminTenantModule(
  tenantId: string,
  moduleId: ModuleId,
  enabled: boolean,
): Promise<void> {
  await requestJson(`/api/admin/tenants/${encodeURIComponent(tenantId)}/modules/${moduleId}`, {
    method: "PATCH",
    body: JSON.stringify({ enabled }),
  });
}

export async function createAdminTenantInvitation(
  tenantId: string,
  input: { email: string; role: TenantRole },
): Promise<UserInvitation> {
  return requestJson<UserInvitation>(
    `/api/admin/tenants/${encodeURIComponent(tenantId)}/invitations`,
    {
      method: "POST",
      body: JSON.stringify(input),
    },
  );
}

export async function getAdminTenantInvitationLink(
  tenantId: string,
  invitationId: string,
): Promise<{ inviteUrl: string }> {
  return requestJson<{ inviteUrl: string }>(
    `/api/admin/tenants/${encodeURIComponent(tenantId)}/invitations/${encodeURIComponent(invitationId)}`,
  );
}

export async function revokeAdminTenantInvitation(
  tenantId: string,
  invitationId: string,
): Promise<UserInvitation> {
  return requestJson<UserInvitation>(
    `/api/admin/tenants/${encodeURIComponent(tenantId)}/invitations/${encodeURIComponent(invitationId)}`,
    { method: "DELETE" },
  );
}

export async function regenerateAdminTenantInvitation(
  tenantId: string,
  invitationId: string,
): Promise<UserInvitation> {
  return requestJson<UserInvitation>(
    `/api/admin/tenants/${encodeURIComponent(tenantId)}/invitations/${encodeURIComponent(invitationId)}/regenerate`,
    { method: "POST" },
  );
}

export async function updateAdminTenantMembershipRole(
  tenantId: string,
  membershipId: string,
  role: TenantRole,
): Promise<TenantMembership> {
  return requestJson<TenantMembership>(
    `/api/admin/tenants/${encodeURIComponent(tenantId)}/memberships/${encodeURIComponent(membershipId)}`,
    {
      method: "PATCH",
      body: JSON.stringify({ role }),
    },
  );
}

export async function revokeAdminTenantMembership(
  tenantId: string,
  membershipId: string,
): Promise<{ success: boolean }> {
  return requestJson<{ success: boolean }>(
    `/api/admin/tenants/${encodeURIComponent(tenantId)}/memberships/${encodeURIComponent(membershipId)}`,
    { method: "DELETE" },
  );
}

export async function getTenantUsers(): Promise<{
  members: TenantMember[];
  invitations: UserInvitation[];
}> {
  return requestJson("/api/tenant/users");
}

export async function updateTenantProfile(input: {
  name?: string;
  displayName?: string;
  basicInfo?: Tenant["basicInfo"];
}): Promise<Tenant> {
  return requestJson<Tenant>("/api/tenant/profile", {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export async function createTenantInvitation(input: {
  email: string;
  role: TenantRole;
}): Promise<UserInvitation> {
  return requestJson<UserInvitation>("/api/tenant/invitations", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function getTenantInvitationLink(
  invitationId: string,
): Promise<{ inviteUrl: string }> {
  return requestJson<{ inviteUrl: string }>(
    `/api/tenant/invitations/${encodeURIComponent(invitationId)}`,
  );
}

export async function revokeTenantInvitation(invitationId: string): Promise<UserInvitation> {
  return requestJson<UserInvitation>(
    `/api/tenant/invitations/${encodeURIComponent(invitationId)}`,
    { method: "DELETE" },
  );
}

export async function regenerateTenantInvitation(invitationId: string): Promise<UserInvitation> {
  return requestJson<UserInvitation>(
    `/api/tenant/invitations/${encodeURIComponent(invitationId)}/regenerate`,
    { method: "POST" },
  );
}

export async function updateTenantMembershipRole(
  membershipId: string,
  role: TenantRole,
): Promise<TenantMembership> {
  return requestJson<TenantMembership>(
    `/api/tenant/memberships/${encodeURIComponent(membershipId)}`,
    {
      method: "PATCH",
      body: JSON.stringify({ role }),
    },
  );
}

export async function revokeTenantMembership(
  membershipId: string,
): Promise<{ success: boolean }> {
  return requestJson<{ success: boolean }>(
    `/api/tenant/memberships/${encodeURIComponent(membershipId)}`,
    { method: "DELETE" },
  );
}

export async function getInvitation(token: string): Promise<UserInvitation> {
  return requestPublicJson<UserInvitation>(`/api/invitations/${encodeURIComponent(token)}`);
}

export async function acceptInvitation(token: string, email: string, password: string): Promise<{
  tenantId: string;
  tenantSlug?: string;
  membership: TenantMembership;
}> {
  return requestPublicJson(`/api/invitations/${encodeURIComponent(token)}`, {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
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
