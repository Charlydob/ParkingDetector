import { sendCheckoutNotification } from "./notificationService.js";
import { getTenantSettings } from "./tenantSettingsService.js";
import { randomBytes, randomUUID } from "node:crypto";

const CHECKOUT_COOLDOWN_SECONDS = Number(process.env.CHECKOUT_COOLDOWN_SECONDS || 120);
const VALID_ROOM_STATUSES = new Set([
  "occupied",
  "checkout_received",
  "ready_for_cleaning",
  "cleaning",
  "ready",
  "unknown",
]);
const VALID_SOURCES = new Set(["qr", "nfc", "manual", "pms", "other"]);

function now() {
  return new Date().toISOString();
}

function cleanString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function token() {
  return `ck_${randomUUID().replace(/-/g, "")}${randomBytes(8).toString("hex")}`;
}

function withinCooldown(event) {
  return (
    event?.timestamp &&
    Date.now() - new Date(event.timestamp).getTime() < CHECKOUT_COOLDOWN_SECONDS * 1000
  );
}

export async function listCheckoutOverview(database, tenantId) {
  const [rooms, events] = await Promise.all([
    database.listTenantRecords("rooms", tenantId),
    database.listTenantRecords("checkoutEvents", tenantId),
  ]);

  return {
    rooms: rooms
      .filter((room) => room.active !== false)
      .sort((left, right) => String(left.number).localeCompare(String(right.number))),
    events: events
      .sort((left, right) => new Date(right.timestamp).getTime() - new Date(left.timestamp).getTime())
      .slice(0, 50),
  };
}

export async function createRoom(database, tenantId, input) {
  const timestamp = now();
  const number = cleanString(input.number);

  if (!number) {
    const error = new Error("Room number is required.");
    error.statusCode = 400;
    throw error;
  }

  const room = {
    id: randomUUID(),
    tenantId,
    number,
    name: cleanString(input.name),
    active: input.active !== false,
    status: VALID_ROOM_STATUSES.has(input.status) ? input.status : "unknown",
    createdAt: timestamp,
    updatedAt: timestamp,
  };

  await database.setRecord("rooms", room.id, room);
  return room;
}

export async function updateRoom(database, tenantId, roomId, patch) {
  const current = await database.getTenantRecord("rooms", tenantId, roomId);

  if (!current) {
    const error = new Error("Room not found.");
    error.statusCode = 404;
    throw error;
  }

  const room = {
    ...current,
    number: cleanString(patch.number) || current.number,
    name: patch.name === undefined ? current.name : cleanString(patch.name),
    active: patch.active === undefined ? current.active !== false : Boolean(patch.active),
    status: VALID_ROOM_STATUSES.has(patch.status) ? patch.status : current.status,
    updatedAt: now(),
  };

  await database.setRecord("rooms", roomId, room);
  return room;
}

export async function listKeyIdentifiers(database, tenantId) {
  return database.listTenantRecords("keyIdentifiers", tenantId);
}

export async function createKeyIdentifier(database, tenantId, input) {
  const room = await database.getTenantRecord("rooms", tenantId, cleanString(input.roomId));

  if (!room) {
    const error = new Error("Room not found.");
    error.statusCode = 404;
    throw error;
  }

  const timestamp = now();
  const key = {
    id: randomUUID(),
    tenantId,
    roomId: room.id,
    type: input.type === "nfc" ? "nfc" : "qr",
    identifier: cleanString(input.identifier) || token(),
    label: cleanString(input.label) || `Room ${room.number}`,
    active: input.active !== false,
    createdAt: timestamp,
    updatedAt: timestamp,
  };

  await database.setRecord("keyIdentifiers", key.id, key);
  return key;
}

export async function updateKeyIdentifier(database, tenantId, keyId, patch) {
  const current = await database.getTenantRecord("keyIdentifiers", tenantId, keyId);

  if (!current) {
    const error = new Error("Key identifier not found.");
    error.statusCode = 404;
    throw error;
  }

  const key = {
    ...current,
    roomId: cleanString(patch.roomId) || current.roomId,
    label: patch.label === undefined ? current.label : cleanString(patch.label),
    active: patch.active === undefined ? current.active !== false : Boolean(patch.active),
    identifier: patch.regenerate ? token() : current.identifier,
    updatedAt: now(),
  };

  if (!(await database.getTenantRecord("rooms", tenantId, key.roomId))) {
    const error = new Error("Room not found.");
    error.statusCode = 404;
    throw error;
  }

  await database.setRecord("keyIdentifiers", keyId, key);
  return key;
}

export async function registerCheckout(database, tenantId, roomId, source, options = {}) {
  if (!VALID_SOURCES.has(source)) {
    const error = new Error("Invalid checkout source.");
    error.statusCode = 400;
    throw error;
  }

  const room = await database.getTenantRecord("rooms", tenantId, roomId);

  if (!room || room.active === false) {
    const error = new Error("Room not found.");
    error.statusCode = 404;
    throw error;
  }

  const existingEvents = (await database.listTenantRecords("checkoutEvents", tenantId))
    .filter(
      (event) =>
        event.roomId === roomId &&
        event.sourceIdentifier === options.sourceIdentifier &&
        withinCooldown(event),
    )
    .sort((left, right) => new Date(right.timestamp).getTime() - new Date(left.timestamp).getTime());

  if (existingEvents[0]) {
    return {
      duplicate: true,
      event: existingEvents[0],
      room,
    };
  }

  const timestamp = now();
  const event = {
    id: randomUUID(),
    tenantId,
    roomId,
    source,
    sourceIdentifier: cleanString(options.sourceIdentifier),
    timestamp,
    status: "registered",
    metadata: options.metadata || {},
  };
  const updatedRoom = {
    ...room,
    status: "ready_for_cleaning",
    lastCheckoutAt: timestamp,
    lastCheckoutSource: source,
    updatedAt: timestamp,
  };

  await database.setRecord("checkoutEvents", event.id, event);
  await database.setRecord("rooms", roomId, updatedRoom);

  const tenantSettings = await getTenantSettings(database, tenantId);
  void sendCheckoutNotification({
    tenantSettings,
    room: updatedRoom,
    event,
  });

  return {
    duplicate: false,
    event,
    room: updatedRoom,
  };
}

export async function registerCheckoutByIdentifier(database, identifier, type = "qr") {
  const cleanIdentifier = cleanString(identifier);
  const matches = (await database.listRecords("keyIdentifiers")).filter(
    (key) =>
      key.identifier === cleanIdentifier &&
      key.type === type &&
      key.active !== false,
  );

  const key = matches[0];

  if (!key) {
    const error = new Error("Checkout key is invalid or inactive.");
    error.statusCode = 404;
    throw error;
  }

  return registerCheckout(database, key.tenantId, key.roomId, type, {
    sourceIdentifier: key.identifier,
    metadata: { keyId: key.id },
  });
}
