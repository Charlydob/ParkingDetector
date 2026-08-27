import { randomInt } from "node:crypto";
import { updateTenantSettings } from "./tenantSettingsService.js";
import { registerCheckout, updateRoom } from "./checkoutService.js";
import {
  canManageHousekeeping,
  requireHousekeepingPermission,
} from "./housekeepingPermissions.js";

const PAIRING_DIAGNOSTIC_KEY = "telegramPairingCodes";
const STAFF_PAIRING_DIAGNOSTIC_KEY = "telegramStaffPairingCodes";
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

  const chatId = cleanTelegramId(input.chatId ?? input.message?.chat?.id);
  const connected = [];
  for (const tenant of tenants.filter((item) => item.active !== false)) {
    const settings = await database.getRecord("tenantSettings", tenant.id);
    const telegram = settings?.notifications?.telegram || {};
    if (telegram.enabled && cleanTelegramId(telegram.chatId)) {
      connected.push({ tenant, chatId: cleanTelegramId(telegram.chatId) });
    }
  }
  if (chatId) {
    const matches = connected.filter((item) => item.chatId === chatId);
    return matches.length === 1 ? matches[0].tenant : undefined;
  }
  return connected.length === 1 ? connected[0].tenant : undefined;
}

async function assertTenantChat(database, tenantId, input = {}) {
  const supplied = cleanTelegramId(input.chatId ?? input.message?.chat?.id);
  if (!supplied) return;
  const settings = await database.getRecord("tenantSettings", tenantId);
  const connected = settings?.notifications?.telegram;
  if (!connected?.enabled || cleanTelegramId(connected.chatId) !== supplied) {
    const error = new Error("Telegram chat is not connected to this tenant.");
    error.statusCode = 403;
    throw error;
  }
}

export async function resolveTelegramActor(database, tenantId, input = {}) {
  const telegramUserId = cleanTelegramId(input.telegramUserId ?? input.from?.id);
  const users = await database.listRecords("users");
  const user = users.find((candidate) => cleanTelegramId(candidate.telegramUserId) === telegramUserId);
  if (!user) {
    const error = new Error("Telegram user is not linked to a HotelApp user. Use /staff CODE first.");
    error.statusCode = 403;
    throw error;
  }
  if (user.globalRole === "platform_admin") {
    return { user, membership: null, role: "platform_admin" };
  }
  const membership = (await database.listRecords("memberships")).find(
    (candidate) => candidate.tenantId === tenantId && candidate.userId === user.id,
  );
  if (!membership) {
    const error = new Error("Telegram user does not have access to this tenant.");
    error.statusCode = 403;
    throw error;
  }
  return { user, membership, role: membership.role };
}

export async function getHousekeepingStaff(database, input = {}) {
  const tenant = await requireTelegramTenant(database, input);
  await assertTenantChat(database, tenant.id, input);

  const [users, memberships] = await Promise.all([
    database.listRecords("users"),
    database.listRecords("memberships"),
  ]);
  const allowedRoles = new Set(["tenant_admin", "manager", "staff"]);
  const usersById = new Map(users.map((user) => [user.id, user]));
  const members = memberships
    .filter((membership) =>
      membership.tenantId === tenant.id && allowedRoles.has(membership.role),
    )
    .map((membership) => ({ membership, user: usersById.get(membership.userId) }))
    .filter(({ user }) => user && user.active !== false)
    .map(({ membership, user }) => ({
      userId: user.id,
      displayName: user.displayName || user.email,
      email: user.email,
      telegramUsername: cleanString(user.telegramUsername).replace(/^@/, ""),
      telegramLinked: Boolean(cleanTelegramId(user.telegramUserId)),
      role: membership.role,
    }));

  return { success: true, tenantId: tenant.id, members };
}

async function resolveAssignmentTarget(database, tenantId, target) {
  const needle = cleanString(target);
  if (!needle) return undefined;
  const [users, memberships] = await Promise.all([
    database.listRecords("users"), database.listRecords("memberships"),
  ]);
  const members = memberships.filter((item) => item.tenantId === tenantId)
    .map((membership) => ({ membership, user: users.find((user) => user.id === membership.userId) }))
    .filter((item) => item.user);
  const lower = needle.toLowerCase();
  const matches = members.filter(({ user }) =>
    needle.startsWith("@")
      ? cleanString(user.telegramUsername).replace(/^@/, "").toLowerCase() === lower.slice(1)
      : cleanString(user.email).toLowerCase() === lower || cleanString(user.displayName).toLowerCase() === lower,
  );
  if (matches.length !== 1) {
    const error = new Error(matches.length ? "Assignment target is ambiguous." : "Assignment target not found in this tenant.");
    error.statusCode = 400;
    throw error;
  }
  return matches[0];
}

function housekeepingMetadata(event) {
  return event?.metadata?.housekeeping && typeof event.metadata.housekeeping === "object"
    ? event.metadata.housekeeping : {};
}

async function hydratedHousekeeping(database, event) {
  const housekeeping = housekeepingMetadata(event);
  const users = await database.listRecords("users");
  const memberships = await database.listRecords("memberships");
  const actor = (id, includeRole = false) => {
    const user = users.find((candidate) => candidate.id === id);
    if (!user) return null;
    const membership = memberships.find((candidate) => candidate.tenantId === event.tenantId && candidate.userId === id);
    return { userId: user.id, displayName: user.displayName || user.email,
      ...(user.telegramUsername ? { telegramUsername: user.telegramUsername } : {}),
      ...(includeRole ? { role: user.globalRole === "platform_admin" ? "platform_admin" : membership?.role || null } : {}) };
  };
  return {
    assignedTo: actor(housekeeping.assignedToUserId, true), assignedAt: housekeeping.assignedAt || null,
    bedDoneBy: actor(housekeeping.bedDoneByUserId), bedDoneAt: housekeeping.bedDoneAt || null,
    cleaningDoneBy: actor(housekeeping.cleaningDoneByUserId), cleaningDoneAt: housekeeping.cleaningDoneAt || null,
    completedBy: actor(housekeeping.completedByUserId), completedAt: housekeeping.completedAt || null,
  };
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
  const itemRows = rooms
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
  const items = await Promise.all(itemRows.map(async (item) => ({
    ...item,
    housekeeping: await hydratedHousekeeping(database, eventByRoom.get(item.roomId)),
  })));
  const checkoutToday = rooms
    .filter((room) => room.active !== false &&
      String(room.checkoutDueDate || "").slice(0, 10) === today)
    .sort((left, right) => String(left.number).localeCompare(String(right.number)))
    .map((room) => ({
      roomId: room.id, roomNumber: room.number, roomName: room.name || "",
      room: room.number, accessCode: room.accessCode ?? null,
      checkoutDueDate: String(room.checkoutDueDate).slice(0, 10), source: room.checkoutDueSource || "manual",
    }));
  const doneRows = rooms
    .filter((room) => room.active !== false && room.status === "ready" && room.lastCleanedAt &&
      localDate(room.lastCleanedAt, timezone) === today && eventByRoom.has(room.id))
    .sort((left, right) => String(left.number).localeCompare(String(right.number)))
    .map((room) => {
      const event = eventByRoom.get(room.id);
      return { roomId: room.id, roomNumber: room.number, roomName: room.name || "", eventId: event.id,
        checkoutTimestamp: event.timestamp, cleanedTimestamp: room.lastCleanedAt, source: event.source };
    });
  const done = await Promise.all(doneRows.map(async (item) => ({
    ...item,
    housekeeping: await hydratedHousekeeping(database, eventByRoom.get(item.roomId)),
  })));
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
  await assertTenantChat(database, tenant.id, input);
  const action = cleanString(input.action || input.type).toLowerCase();
  let eventId = cleanString(input.eventId || input.checkoutEventId);
  const chatId = cleanTelegramId(input.chatId ?? input.message?.chat?.id);
  const telegramUserId = cleanTelegramId(input.telegramUserId ?? input.from?.id);

  if (!["ready", "claim", "bed_done", "cleaning_done", "complete", "assign"].includes(action) || !telegramUserId) {
    const error = new Error("Invalid housekeeping action.");
    error.statusCode = 400;
    throw error;
  }

  const actor = action === "ready" ? null : await resolveTelegramActor(database, tenant.id, input);
  if (actor) requireHousekeepingPermission(actor.role, action === "assign" ? "manage" : "use");
  if (!eventId && cleanString(input.roomNumber)) {
    const timezone = tenant.basicInfo?.timezone || "UTC";
    const today = localDate(new Date(), timezone);
    const rooms = await database.listTenantRecords("rooms", tenant.id);
    const room = rooms.find((candidate) => String(candidate.number).toLowerCase() === cleanString(input.roomNumber).toLowerCase());
    const candidates = room ? (await database.listTenantRecords("checkoutEvents", tenant.id))
      .filter((event) => event.roomId === room.id && localDate(event.timestamp, timezone) === today)
      .sort((left, right) => new Date(right.timestamp) - new Date(left.timestamp)) : [];
    eventId = candidates[0]?.id || "";
  }
  if (!eventId) {
    const error = new Error("An active checkout event is required."); error.statusCode = 404; throw error;
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

  if (action !== "ready") {
    const timestamp = now();
    const housekeeping = { ...housekeepingMetadata(event) };
    if (action === "claim") {
      if (housekeeping.assignedToUserId && housekeeping.assignedToUserId !== actor.user.id && !canManageHousekeeping(actor.role)) {
        const error = new Error("Room is already assigned to another staff member."); error.statusCode = 403; throw error;
      }
      if (housekeeping.assignedToUserId !== actor.user.id) {
        Object.assign(housekeeping, { assignedToUserId: actor.user.id, assignedByUserId: actor.user.id, assignedAt: timestamp });
      }
    } else if (action === "assign") {
      const target = await resolveAssignmentTarget(database, tenant.id, input.assignmentTarget);
      Object.assign(housekeeping, { assignedToUserId: target.user.id, assignedByUserId: actor.user.id, assignedAt: timestamp });
    } else if (action === "bed_done" && !housekeeping.bedDoneAt) {
      Object.assign(housekeeping, { bedDoneByUserId: actor.user.id, bedDoneAt: timestamp });
    } else if (action === "cleaning_done" && !housekeeping.cleaningDoneAt) {
      Object.assign(housekeeping, { cleaningDoneByUserId: actor.user.id, cleaningDoneAt: timestamp });
    } else if (action === "complete") {
      if (!housekeeping.bedDoneAt) {
        Object.assign(housekeeping, { bedDoneByUserId: actor.user.id, bedDoneAt: timestamp });
      }
      if (!housekeeping.cleaningDoneAt) {
        Object.assign(housekeeping, { cleaningDoneByUserId: actor.user.id, cleaningDoneAt: timestamp });
      }
      if (!housekeeping.completedAt) {
        Object.assign(housekeeping, { completedByUserId: actor.user.id, completedAt: timestamp });
      }
    }
    await database.setRecord("checkoutEvents", event.id, {
      ...event, metadata: { ...(event.metadata || {}), housekeeping },
    });
    if (action === "claim" && room.status === "ready_for_cleaning") {
      await updateRoom(database, tenant.id, room.id, { status: "cleaning" });
    }
    if (action === "complete") await updateRoom(database, tenant.id, room.id, { status: "ready" });
    return { success: true, action, board: await getHousekeepingBoard(database, { tenantId: tenant.id }) };
  }

  // Preserve the legacy two-tap `ready` action used by existing Telegram workflows.
  if (!chatId) { const error = new Error("Invalid housekeeping action."); error.statusCode = 400; throw error; }
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

export async function createStaffPairingCode(database, session, tenantId) {
  const tenant = await database.getRecord("tenants", tenantId);
  const membership = session.memberships?.find((item) => item.tenantId === tenantId);
  if (!tenant || (!session.isPlatformAdmin && !membership)) {
    const error = new Error("You do not have access to this tenant."); error.statusCode = 403; throw error;
  }
  const stored = await database.getRecord("diagnostics", STAFF_PAIRING_DIAGNOSTIC_KEY);
  const state = stored?.value && typeof stored.value === "object" ? stored.value : stored || {};
  state.codes ||= {};
  let code = generateCode();
  while (isUsable(state.codes[code])) code = generateCode();
  const expiresAt = expiresAtFromNow();
  state.codes[code] = { code, userId: session.user.id, tenantId, createdAt: now(), expiresAt };
  await database.setRecord("diagnostics", STAFF_PAIRING_DIAGNOSTIC_KEY, state);
  return { code, expiresAt, tenant: publicTenant(tenant), user: {
    id: session.user.id, displayName: session.user.displayName, email: session.user.email,
    telegramUserId: session.user.telegramUserId || null, telegramUsername: session.user.telegramUsername || null,
  } };
}

export async function connectTelegramStaff(database, input = {}) {
  const code = cleanString(input.code).toUpperCase();
  const telegramUserId = cleanTelegramId(input.telegramUserId);
  const stored = await database.getRecord("diagnostics", STAFF_PAIRING_DIAGNOSTIC_KEY);
  const state = stored?.value && typeof stored.value === "object" ? stored.value : stored || {};
  const pairing = state.codes?.[code];
  if (!telegramUserId || !isUsable(pairing)) {
    const error = new Error("Invalid or expired staff pairing code."); error.statusCode = 400; throw error;
  }
  const [user, tenant, users, memberships] = await Promise.all([
    database.getRecord("users", pairing.userId), database.getRecord("tenants", pairing.tenantId),
    database.listRecords("users"), database.listRecords("memberships"),
  ]);
  const role = user?.globalRole === "platform_admin" ? "platform_admin" :
    memberships.find((item) => item.tenantId === pairing.tenantId && item.userId === pairing.userId)?.role;
  if (!user || !tenant || !role) {
    const error = new Error("Staff pairing is no longer valid."); error.statusCode = 400; throw error;
  }
  const alreadyLinked = users.find((candidate) => cleanTelegramId(candidate.telegramUserId) === telegramUserId && candidate.id !== user.id);
  if (alreadyLinked) {
    const error = new Error("Telegram user is already linked to another HotelApp user."); error.statusCode = 409; throw error;
  }
  const username = cleanString(input.telegramUsername).replace(/^@/, "");
  await database.setRecord("users", user.id, { ...user, telegramUserId, telegramUsername: username || null, telegramLinkedAt: now() });
  delete state.codes[code];
  await database.setRecord("diagnostics", STAFF_PAIRING_DIAGNOSTIC_KEY, state);
  return { success: true, userId: user.id, displayName: user.displayName || user.email, role,
    tenantId: tenant.id, telegramUsername: username || null, message: `Telegram linked to ${user.displayName || user.email}.` };
}

export async function registerManualTelegramCheckout(database, input = {}) {
  const tenant = await requireTelegramTenant(database, input);
  await assertTenantChat(database, tenant.id, input);
  const actor = await resolveTelegramActor(database, tenant.id, input);
  requireHousekeepingPermission(actor.role, "manage");
  const roomNumber = cleanString(input.roomNumber);
  const rooms = await database.listTenantRecords("rooms", tenant.id);
  const room = rooms.find((candidate) => candidate.active !== false && String(candidate.number).toLowerCase() === roomNumber.toLowerCase());
  if (!room) { const error = new Error("Room not found."); error.statusCode = 404; throw error; }
  const target = input.assignmentTarget ? await resolveAssignmentTarget(database, tenant.id, input.assignmentTarget) : undefined;
  const timestamp = now();
  const metadata = { origin: "telegram", actorUserId: actor.user.id,
    actorTelegramUserId: cleanTelegramId(input.telegramUserId ?? input.from?.id),
    ...(target ? { housekeeping: { assignedToUserId: target.user.id, assignedByUserId: actor.user.id, assignedAt: timestamp } } : {}) };
  const result = await registerCheckout(database, tenant.id, room.id, "manual", { metadata });
  return { success: true, duplicate: result.duplicate, tenantId: tenant.id, event: result.event, room: result.room };
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
