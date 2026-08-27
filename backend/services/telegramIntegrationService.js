import { randomInt } from "node:crypto";
import { updateTenantSettings } from "./tenantSettingsService.js";
import { updateRoom } from "./checkoutService.js";

const PAIRING_DIAGNOSTIC_KEY = "telegramPairingCodes";
const BOARD_DIAGNOSTIC_KEY = "telegramHousekeepingBoards";
const READY_CONFIRMATION_DIAGNOSTIC_KEY = "telegramReadyConfirmations";
const PAIRING_CODE_TTL_MINUTES = 10;
const READY_CONFIRMATION_TTL_SECONDS = 30;
const PAIRING_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function now() {
  return new Date().toISOString();
}

function cleanString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function cleanTelegramId(value) {
  if (value === undefined || value === null) {
    return "";
  }

  return typeof value === "string" || typeof value === "number" || typeof value === "bigint"
    ? String(value).trim()
    : "";
}

function cleanTelegramIntegerId(value) {
  if (value === undefined || value === null || value === "") {
    return "";
  }

  if (typeof value === "number" && Number.isSafeInteger(value)) {
    return value;
  }

  const raw = cleanTelegramId(value);
  if (!raw) {
    return "";
  }

  const parsed = Number(raw);
  return Number.isSafeInteger(parsed) && String(parsed) === raw ? parsed : raw;
}

function firstPresent(...values) {
  return values.find((value) => value !== undefined && value !== null && value !== "");
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

async function getDiagnosticValue(database, key) {
  const stored = await database.getRecord("diagnostics", key);
  return stored?.value && typeof stored.value === "object" ? stored.value : stored || {};
}

async function saveDiagnosticValue(database, key, value) {
  await database.setRecord("diagnostics", key, value);
}

async function resolveTenant(database, input = {}) {
  const tenantId = cleanString(input.tenantId);
  const tenantSlug = cleanString(input.tenantSlug || input.slug);

  if (tenantId) {
    const tenant = await database.getRecord("tenants", tenantId);

    if (tenant && tenant.active !== false) {
      return tenant;
    }
  }

  const tenants = await database.listRecords("tenants");

  if (tenantSlug) {
    return tenants.find((tenant) => tenant.slug === tenantSlug && tenant.active !== false);
  }

  const activeTenants = tenants.filter((tenant) => tenant.active !== false);
  return activeTenants.length === 1 ? activeTenants[0] : undefined;
}

function latestEventByRoom(events) {
  const byRoom = new Map();

  for (const event of [...events].sort(
    (left, right) => new Date(right.timestamp).getTime() - new Date(left.timestamp).getTime(),
  )) {
    if (!byRoom.has(event.roomId)) {
      byRoom.set(event.roomId, event);
    }
  }

  return byRoom;
}

function publicHousekeepingBoardRecord(record = {}) {
  if (!record || typeof record !== "object" || !record.messageId) {
    return {};
  }

  return {
    tenantId: cleanString(record.tenantId),
    chatId: cleanTelegramId(record.chatId),
    messageId: cleanTelegramIntegerId(record.messageId),
    threadId: cleanTelegramIntegerId(record.threadId),
    updatedAt: cleanString(record.updatedAt),
  };
}

async function requireTelegramTenant(database, input = {}) {
  const tenant = await resolveTenant(database, input);

  if (!tenant) {
    const error = new Error("Tenant not found.");
    error.statusCode = 404;
    throw error;
  }

  return tenant;
}

function cleanPendingConfirmations(confirmations = {}) {
  return Object.fromEntries(
    Object.entries(confirmations).filter(
      ([, record]) => record?.expiresAt && new Date(record.expiresAt).getTime() > Date.now(),
    ),
  );
}

function confirmationKey({ chatId, telegramUserId, eventId }) {
  return `${chatId}:${telegramUserId}:${eventId}`;
}

function localDate(value, timezone) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone || "UTC",
    year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(date);
  const part = (type) => parts.find((item) => item.type === type)?.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}

export async function getHousekeepingBoard(database, input = {}) {
  const tenant = await requireTelegramTenant(database, input);
  const [rooms, events, boards] = await Promise.all([
    database.listTenantRecords("rooms", tenant.id),
    database.listTenantRecords("checkoutEvents", tenant.id),
    getDiagnosticValue(database, BOARD_DIAGNOSTIC_KEY),
  ]);
  const timezone = tenant.basicInfo?.timezone || "UTC";
  const today = localDate(new Date(), timezone);
  const todayEvents = events.filter((event) => localDate(event.timestamp, timezone) === today);
  const eventByRoom = latestEventByRoom(todayEvents);
  const pendingStatuses = new Set(["ready_for_cleaning", "cleaning"]);
  const items = rooms
    .filter((room) => room.active !== false && pendingStatuses.has(room.status) && eventByRoom.has(room.id))
    .sort((left, right) => String(left.number).localeCompare(String(right.number)))
    .map((room) => {
      const event = eventByRoom.get(room.id);

      return {
        roomId: room.id,
        roomNumber: room.number,
        roomName: room.name || "",
        status: room.status,
        eventId: event?.id || "",
        checkoutTimestamp: event?.timestamp || room.lastCheckoutAt || "",
        source: event?.source || room.lastCheckoutSource || "",
      };
    });
  const checkoutToday = rooms
    .filter((room) => room.active !== false &&
      String(room.checkoutDueDate || "").slice(0, 10) === today)
    .sort((left, right) => String(left.number).localeCompare(String(right.number)))
    .map((room) => ({
      roomId: room.id, roomNumber: room.number, roomName: room.name || "",
      room: room.number, accessCode: room.accessCode ?? null,
      checkoutDueDate: String(room.checkoutDueDate).slice(0, 10), source: room.checkoutDueSource || "manual",
    }));
  const done = rooms
    .filter((room) => room.active !== false && room.status === "ready" && room.lastCleanedAt &&
      localDate(room.lastCleanedAt, timezone) === today && eventByRoom.has(room.id))
    .sort((left, right) => String(left.number).localeCompare(String(right.number)))
    .map((room) => {
      const event = eventByRoom.get(room.id);
      return { roomId: room.id, roomNumber: room.number, roomName: room.name || "", eventId: event.id,
        checkoutTimestamp: event.timestamp, cleanedTimestamp: room.lastCleanedAt, source: event.source };
    });
  const staleTelegramMessages = events
    .filter((event) => event.telegramMessageId && event.telegramChatId && !event.telegramMessageDeletedAt &&
      localDate(event.timestamp, timezone) < today)
    .map((event) => ({ eventId: event.id, messageId: event.telegramMessageId,
      chatId: event.telegramChatId, checkoutDate: localDate(event.timestamp, timezone) }));

  return {
    tenant: publicTenant(tenant),
    board: publicHousekeepingBoardRecord(boards[tenant.id]),
    updatedAt: now(),
    date: today,
    timezone,
    checkoutToday,
    pendingCleaning: items,
    done,
    staleTelegramMessages,
    items,
    summary: {
      checkoutToday: checkoutToday.length,
      waiting: items.filter((item) => item.status === "ready_for_cleaning").length,
      cleaning: items.filter((item) => item.status === "cleaning").length,
      done: done.length,
      total: items.length,
    },
  };
}

export async function saveCheckoutTelegramMessage(database, input = {}) {
  const tenant = await requireTelegramTenant(database, input);
  const eventId = cleanString(input.eventId || input.checkoutEventId);
  const event = await database.getTenantRecord("checkoutEvents", tenant.id, eventId);
  if (!event) {
    const error = new Error("Checkout event not found."); error.statusCode = 404; throw error;
  }
  const messageId = cleanTelegramIntegerId(firstPresent(input.messageId, input.message_id, input.result?.message_id));
  const chatId = cleanTelegramId(firstPresent(input.chatId, input.chat_id, input.result?.chat?.id));
  if (!messageId || !chatId) {
    const error = new Error("Telegram messageId and chatId are required."); error.statusCode = 400; throw error;
  }
  const updated = { ...event, telegramMessageId: String(messageId), telegramChatId: chatId };
  if (input.deleted === true) updated.telegramMessageDeletedAt = now();
  await database.setRecord("checkoutEvents", event.id, updated);
  return { success: true, tenantId: tenant.id, eventId: event.id, messageId, chatId,
    checkoutDate: localDate(event.timestamp, tenant.basicInfo?.timezone || "UTC"),
    deleted: Boolean(updated.telegramMessageDeletedAt) };
}

export async function saveHousekeepingBoardMessage(database, input = {}) {
  const tenant = await requireTelegramTenant(database, input);
  const boards = await getDiagnosticValue(database, BOARD_DIAGNOSTIC_KEY);
  const messageId = cleanTelegramIntegerId(
    firstPresent(input.messageId, input.message_id, input.message?.message_id, input.result?.message_id),
  );

  if (!messageId) {
    const error = new Error("Telegram board messageId is required.");
    error.statusCode = 400;
    throw error;
  }

  boards[tenant.id] = {
    tenantId: tenant.id,
    chatId: cleanTelegramId(
      firstPresent(
        input.chatId,
        input.chat_id,
        input.chat?.id,
        input.message?.chat?.id,
        input.result?.chat?.id,
      ),
    ),
    messageId,
    threadId: cleanTelegramIntegerId(
      firstPresent(
        input.threadId,
        input.message_thread_id,
        input.message?.message_thread_id,
        input.result?.message_thread_id,
      ),
    ),
    updatedAt: now(),
  };
  await saveDiagnosticValue(database, BOARD_DIAGNOSTIC_KEY, boards);

  return getHousekeepingBoard(database, { tenantId: tenant.id });
}

export async function handleHousekeepingAction(database, input = {}) {
  const tenant = await requireTelegramTenant(database, input);
  const action = cleanString(input.action || input.type).toLowerCase();
  const eventId = cleanString(input.eventId || input.checkoutEventId);
  const chatId = cleanTelegramId(input.chatId ?? input.message?.chat?.id);
  const telegramUserId = cleanTelegramId(input.telegramUserId ?? input.from?.id);

  if (action !== "ready" || !eventId || !chatId || !telegramUserId) {
    const error = new Error("Invalid housekeeping action.");
    error.statusCode = 400;
    throw error;
  }

  const event = await database.getTenantRecord("checkoutEvents", tenant.id, eventId);

  if (!event) {
    const error = new Error("Checkout event not found.");
    error.statusCode = 404;
    throw error;
  }

  const room = await database.getTenantRecord("rooms", tenant.id, event.roomId);

  if (!room || room.active === false) {
    const error = new Error("Room not found.");
    error.statusCode = 404;
    throw error;
  }

  const state = await getDiagnosticValue(database, READY_CONFIRMATION_DIAGNOSTIC_KEY);
  state.pending = cleanPendingConfirmations(state.pending);
  const key = confirmationKey({ chatId, telegramUserId, eventId });
  const pending = state.pending[key];

  if (!pending) {
    const expiresAt = new Date(Date.now() + READY_CONFIRMATION_TTL_SECONDS * 1000).toISOString();
    state.pending[key] = {
      tenantId: tenant.id,
      roomId: room.id,
      eventId,
      chatId,
      telegramUserId,
      expiresAt,
      createdAt: now(),
    };
    await saveDiagnosticValue(database, READY_CONFIRMATION_DIAGNOSTIC_KEY, state);

    return {
      success: true,
      confirmationRequired: true,
      expiresAt,
      board: await getHousekeepingBoard(database, { tenantId: tenant.id }),
    };
  }

  delete state.pending[key];
  await saveDiagnosticValue(database, READY_CONFIRMATION_DIAGNOSTIC_KEY, state);
  await updateRoom(database, tenant.id, room.id, { status: "ready" });

  return {
    success: true,
    confirmed: true,
    board: await getHousekeepingBoard(database, { tenantId: tenant.id }),
  };
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
  const chatId = cleanTelegramId(input.chatId);

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
        telegramUserId: cleanTelegramId(input.telegramUserId),
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
