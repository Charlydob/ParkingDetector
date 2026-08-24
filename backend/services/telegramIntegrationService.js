import { randomInt } from "node:crypto";
import { updateTenantSettings } from "./tenantSettingsService.js";

const PAIRING_DIAGNOSTIC_KEY = "telegramPairingCodes";
const PAIRING_CODE_TTL_MINUTES = 10;
const PAIRING_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function now() {
  return new Date().toISOString();
}

function cleanString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function publicTenant(tenant) {
  return {
    id: tenant.id,
    name: tenant.name,
    slug: tenant.slug,
  };
}

function expiresAtFromNow() {
  return new Date(Date.now() + PAIRING_CODE_TTL_MINUTES * 60 * 1000).toISOString();
}

function isExpired(record) {
  return !record?.expiresAt || new Date(record.expiresAt).getTime() <= Date.now();
}

function isUsable(record) {
  return record && !record.usedAt && !isExpired(record);
}

function generateCode() {
  let code = "";

  for (let index = 0; index < 6; index += 1) {
    code += PAIRING_CODE_ALPHABET[randomInt(0, PAIRING_CODE_ALPHABET.length)];
  }

  return code;
}

async function getPairingState(database) {
  const stored = await database.getRecord("diagnostics", PAIRING_DIAGNOSTIC_KEY);
  const value = stored?.value && typeof stored.value === "object" ? stored.value : stored;
  const codes = value?.codes && typeof value.codes === "object" ? value.codes : {};

  return { codes };
}

async function savePairingState(database, state) {
  await database.setRecord("diagnostics", PAIRING_DIAGNOSTIC_KEY, {
    codes: Object.fromEntries(
      Object.entries(state.codes || {}).filter(
        ([, record]) => record && !record.usedAt && !isExpired(record),
      ),
    ),
  });
}

export async function createTelegramPairingCode(database, tenantId) {
  const tenant = await database.getRecord("tenants", tenantId);

  if (!tenant || tenant.active === false) {
    const error = new Error("Tenant not found.");
    error.statusCode = 404;
    throw error;
  }

  const state = await getPairingState(database);
  let code = generateCode();

  for (let attempts = 0; attempts < 10 && isUsable(state.codes[code]); attempts += 1) {
    code = generateCode();
  }

  const expiresAt = expiresAtFromNow();
  state.codes[code] = {
    code,
    tenantId,
    expiresAt,
    createdAt: now(),
  };

  await savePairingState(database, state);

  return {
    code,
    expiresAt,
    tenant: publicTenant(tenant),
  };
}

export function validateTelegramIntegrationSecret(headers = {}) {
  const expectedSecret = cleanString(process.env.N8N_CHECKOUT_WEBHOOK_SECRET);
  const receivedSecret = cleanString(
    headers["x-hotelapp-secret"] || headers["X-HotelApp-Secret"],
  );

  return Boolean(expectedSecret && receivedSecret && receivedSecret === expectedSecret);
}

export async function connectTelegramChat(database, input = {}) {
  const code = cleanString(input.code).toUpperCase();
  const chatId = cleanString(input.chatId);

  if (!code || !chatId) {
    return { success: false, error: "Invalid or expired pairing code." };
  }

  const state = await getPairingState(database);
  const pairing = state.codes[code];

  if (!isUsable(pairing)) {
    return { success: false, error: "Invalid or expired pairing code." };
  }

  const tenant = await database.getRecord("tenants", pairing.tenantId);

  if (!tenant || tenant.active === false) {
    pairing.usedAt = now();
    await savePairingState(database, state);
    return { success: false, error: "Invalid or expired pairing code." };
  }

  await updateTenantSettings(database, tenant.id, {
    notifications: {
      telegram: {
        enabled: true,
        chatId,
        chatTitle: cleanString(input.chatTitle),
        chatType: cleanString(input.chatType),
        connectedAt: now(),
        telegramUserId: cleanString(input.telegramUserId),
        telegramUsername: cleanString(input.telegramUsername),
      },
    },
  });

  pairing.usedAt = now();
  await savePairingState(database, state);

  return {
    success: true,
    tenant: publicTenant(tenant),
  };
}

export async function disconnectTelegramChat(database, tenantId) {
  const tenant = await database.getRecord("tenants", tenantId);

  if (!tenant || tenant.active === false) {
    const error = new Error("Tenant not found.");
    error.statusCode = 404;
    throw error;
  }

  await updateTenantSettings(database, tenantId, {
    notifications: {
      telegram: {
        enabled: false,
        chatId: "",
        chatTitle: "",
        chatType: "",
        connectedAt: "",
        telegramUserId: "",
        telegramUsername: "",
      },
    },
  });

  return { success: true };
}
