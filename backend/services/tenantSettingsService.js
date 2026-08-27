import { getPublicNotificationSettings } from "./notificationService.js";
import { RESERVATION_COLUMN_MAPPING } from "../../shared/reservationMapping.mjs";

const DEFAULT_RESERVATION_WEBHOOK_HEADER = "x-hotel-automation-secret";

function now() {
  return new Date().toISOString();
}

function deepMerge(left = {}, right = {}) {
  const output = { ...left };

  for (const [key, value] of Object.entries(right)) {
    output[key] =
      value && typeof value === "object" && !Array.isArray(value)
        ? deepMerge(output[key], value)
        : value;
  }

  return output;
}

function cleanString(value) {
  return typeof value === "string" ? value.trim() : "";
}

export const DASHBOARD_WIDGET_KEYS = Object.freeze([
  "housekeeping",
  "checkouts",
  "reservations",
  "parking",
  "recentActivity",
  "notifications",
  "telegram",
  "diagnostics",
]);

export const DEFAULT_DASHBOARD_WIDGETS = Object.freeze({
  staff: {
    housekeeping: true,
    checkouts: true,
    reservations: false,
    parking: false,
    recentActivity: false,
    notifications: true,
    telegram: false,
    diagnostics: false,
  },
  manager: {
    housekeeping: true,
    checkouts: true,
    reservations: true,
    parking: true,
    recentActivity: true,
    notifications: true,
    telegram: false,
    diagnostics: false,
  },
  tenant_admin: {
    housekeeping: true,
    checkouts: true,
    reservations: true,
    parking: true,
    recentActivity: true,
    notifications: true,
    telegram: true,
    diagnostics: false,
  },
  platform_admin: {
    housekeeping: true,
    checkouts: true,
    reservations: true,
    parking: true,
    recentActivity: true,
    notifications: true,
    telegram: true,
    diagnostics: true,
  },
});

function cleanDashboardWidgets(widgets = {}) {
  const source = widgets?.widgets && typeof widgets.widgets === "object" ? widgets.widgets : widgets;
  const cleanRole = (role) => {
    const defaults = DEFAULT_DASHBOARD_WIDGETS[role] || {};
    const input = source?.[role] || {};

    return Object.fromEntries(
      DASHBOARD_WIDGET_KEYS.map((key) => [
        key,
        input[key] === undefined ? Boolean(defaults[key]) : Boolean(input[key]),
      ]),
    );
  };

  return {
    widgets: {
      staff: cleanRole("staff"),
      manager: cleanRole("manager"),
      tenant_admin: cleanRole("tenant_admin"),
      platform_admin: cleanRole("platform_admin"),
    },
  };
}

function cleanTelegramId(value) {
  if (value === undefined || value === null) {
    return "";
  }

  return typeof value === "string" || typeof value === "number" || typeof value === "bigint"
    ? String(value).trim()
    : "";
}

function maskSecret(value) {
  const secret = cleanString(value);

  if (!secret) {
    return "";
  }

  return `${"*".repeat(10)}${secret.slice(-4)}`;
}

function cleanTelegramDiagnostics(diagnostics = {}) {
  return {
    lastAttemptAt: cleanString(diagnostics.lastAttemptAt),
    lastSuccessAt: cleanString(diagnostics.lastSuccessAt),
    lastError: cleanString(diagnostics.lastError),
    httpStatus: diagnostics.httpStatus === undefined ? undefined : Number(diagnostics.httpStatus),
    checkoutEventId: cleanString(diagnostics.checkoutEventId),
    room: cleanString(diagnostics.room),
    source: cleanString(diagnostics.source),
  };
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

function cleanJsonAuth(auth = {}, currentAuth = {}) {
  const type = ["none", "bearer", "apiKey", "basic"].includes(auth.type)
    ? auth.type
    : currentAuth.type || "none";

  if (type === "none") {
    return { type: "none", apiKeyHeader: "x-api-key" };
  }

  return {
    type,
    bearerToken: cleanString(auth.bearerToken) || currentAuth.bearerToken || "",
    apiKeyHeader: cleanString(auth.apiKeyHeader) || currentAuth.apiKeyHeader || "x-api-key",
    apiKeyValue: cleanString(auth.apiKeyValue) || currentAuth.apiKeyValue || "",
    basicUsername: cleanString(auth.basicUsername) || currentAuth.basicUsername || "",
    basicPassword: cleanString(auth.basicPassword) || currentAuth.basicPassword || "",
  };
}

function emptyTenantSettings(tenantId) {
  return {
    tenantId,
    reservations: {
      enabled: false,
      source: null,
      mapping: cleanMapping(),
      googleSheets: {
        csvUrl: "",
      },
      jsonFeed: {
        url: "",
        jsonPath: "",
        auth: { type: "none", apiKeyHeader: "x-api-key" },
      },
      reservationWebhook: {
        headerName: DEFAULT_RESERVATION_WEBHOOK_HEADER,
        secret: "",
      },
      sourceDiagnostics: {},
    },
    frigate: {
      enabled: false,
      baseUrl: "",
      pollIntervalMs: 5000,
      cameras: [],
    },
    stripe: {
      enabled: false,
      secretKey: "",
      webhookSecret: "",
    },
    notifications: {
      telegram: {
        enabled: false,
        chatId: "",
      },
    },
    dashboard: cleanDashboardWidgets(),
    integrations: {},
  };
}

function normalizeSettings(tenantId, stored = {}) {
  const base = emptyTenantSettings(tenantId);
  const next = deepMerge(base, stored);

  return {
    ...next,
    tenantId,
    reservations: {
      ...next.reservations,
      mapping: cleanMapping(next.reservations?.mapping),
      jsonFeed: {
        ...next.reservations?.jsonFeed,
        auth: cleanJsonAuth(next.reservations?.jsonFeed?.auth),
      },
      reservationWebhook: {
        headerName:
          cleanString(next.reservations?.reservationWebhook?.headerName) ||
          DEFAULT_RESERVATION_WEBHOOK_HEADER,
        secret: cleanString(next.reservations?.reservationWebhook?.secret),
      },
    },
    frigate: {
      ...next.frigate,
      pollIntervalMs: Number(next.frigate?.pollIntervalMs || 5000),
      cameras: Array.isArray(next.frigate?.cameras) ? next.frigate.cameras : [],
    },
    notifications: {
      ...next.notifications,
      telegram: {
        enabled: Boolean(next.notifications?.telegram?.enabled),
        chatId: cleanTelegramId(next.notifications?.telegram?.chatId),
        chatTitle: cleanString(next.notifications?.telegram?.chatTitle),
        chatType: cleanString(next.notifications?.telegram?.chatType),
        connectedAt: cleanString(next.notifications?.telegram?.connectedAt),
        telegramUserId: cleanTelegramId(next.notifications?.telegram?.telegramUserId),
        telegramUsername: cleanString(next.notifications?.telegram?.telegramUsername),
        diagnostics: cleanTelegramDiagnostics(next.notifications?.telegram?.diagnostics),
      },
    },
    dashboard: cleanDashboardWidgets(next.dashboard?.widgets ? next.dashboard : { widgets: next.dashboard }),
  };
}

export async function getTenantSettings(database, tenantId = DEFAULT_TENANT_ID) {
  const stored = await database.getRecord("tenantSettings", tenantId);

  return normalizeSettings(tenantId, stored);
}

export async function createEmptyTenantSettings(database, tenantId) {
  const timestamp = now();
  const settings = {
    ...emptyTenantSettings(tenantId),
    createdAt: timestamp,
    updatedAt: timestamp,
  };

  await database.setRecord("tenantSettings", tenantId, settings);
  return settings;
}

export async function updateTenantSettings(database, tenantId, patch) {
  const current = await getTenantSettings(database, tenantId);
  const next = normalizeSettings(tenantId, {
    ...deepMerge(current, patch),
    tenantId,
    updatedAt: now(),
  });

  await database.setRecord("tenantSettings", tenantId, next);

  return next;
}

export async function getTenantDashboardSettings(database, tenantId) {
  const settings = await getTenantSettings(database, tenantId);
  return settings.dashboard;
}

export async function updateTenantDashboardSettings(database, tenantId, patch = {}) {
  const current = await getTenantSettings(database, tenantId);
  const dashboard = cleanDashboardWidgets({
    widgets: deepMerge(current.dashboard?.widgets || {}, patch.widgets || patch || {}),
  });

  await updateTenantSettings(database, tenantId, { dashboard });
  return dashboard;
}

export async function getPublicTenantSettings(database, tenantId) {
  const settings = await getTenantSettings(database, tenantId);
  const reservationSource = settings.reservations?.source || "demo";
  const jsonAuth = settings.reservations?.jsonFeed?.auth || {};
  const telegram = getPublicNotificationSettings(settings.notifications);

  return {
    reservations: {
      source: reservationSource,
      mapping: settings.reservations?.mapping || cleanMapping(),
      googleSheets: {
        connected:
          reservationSource === "googleSheets" &&
          Boolean(settings.reservations?.googleSheets?.csvUrl),
        csvUrl: settings.reservations?.googleSheets?.csvUrl || "",
      },
      jsonFeed: {
        connected: reservationSource === "json" && Boolean(settings.reservations?.jsonFeed?.url),
        url: settings.reservations?.jsonFeed?.url || "",
        jsonPath: settings.reservations?.jsonFeed?.jsonPath || "",
        auth: {
          type: jsonAuth.type || "none",
          apiKeyHeader: jsonAuth.apiKeyHeader || "x-api-key",
          configured: Boolean(
            jsonAuth.bearerToken ||
              jsonAuth.apiKeyValue ||
              jsonAuth.basicUsername ||
              jsonAuth.basicPassword,
          ),
        },
      },
      reservationWebhook: {
        connected: reservationSource === "reservationWebhook",
        urlPath: "/api/reservations/webhook",
        headerName:
          settings.reservations?.reservationWebhook?.headerName ||
          DEFAULT_RESERVATION_WEBHOOK_HEADER,
        secretConfigured: Boolean(settings.reservations?.reservationWebhook?.secret),
      },
      sourceDiagnostics: settings.reservations?.sourceDiagnostics || {},
    },
    stripe: {
      connected: Boolean(
        settings.stripe?.enabled &&
          settings.stripe?.secretKey &&
          settings.stripe?.webhookSecret,
      ),
      secretKeyMasked: maskSecret(settings.stripe?.secretKey),
      webhookSecretConfigured: Boolean(settings.stripe?.webhookSecret),
    },
    frigate: {
      connected: Boolean(settings.frigate?.enabled && settings.frigate?.baseUrl),
      baseUrl: settings.frigate?.baseUrl || "",
      pollIntervalMs: settings.frigate?.pollIntervalMs || 5000,
      cameras: settings.frigate?.cameras || [],
    },
    notifications: telegram,
    dashboard: settings.dashboard || cleanDashboardWidgets(),
  };
}
