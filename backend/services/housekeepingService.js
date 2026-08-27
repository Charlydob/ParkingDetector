import { registerCheckout, updateRoom } from "./checkoutService.js";
import {
  canManageHousekeeping,
  requireHousekeepingPermission,
} from "./housekeepingPermissions.js";
import {
  sendAssignmentPush,
  sendRoomCompletedPush,
} from "./webPushService.js";

const PENDING_STATUSES = new Set(["ready_for_cleaning", "cleaning"]);
const ALLOWED_ACTIONS = new Set(["claim", "bed_done", "cleaning_done", "complete", "assign"]);
const MEMBER_ROLES = new Set(["tenant_admin", "manager", "staff"]);

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

function localDate(value, timezone) {
  if (!value) {
    return "";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone || "UTC",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const part = (type) => parts.find((item) => item.type === type)?.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
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

function housekeepingMetadata(event) {
  return event?.metadata?.housekeeping && typeof event.metadata.housekeeping === "object"
    ? event.metadata.housekeeping
    : {};
}

async function actorHydrator(database, tenantId) {
  const [users, memberships] = await Promise.all([
    database.listRecords("users"),
    database.listRecords("memberships"),
  ]);

  return (id, includeRole = false) => {
    const user = users.find((candidate) => candidate.id === id);
    if (!user) {
      return null;
    }

    const membership = memberships.find(
      (candidate) => candidate.tenantId === tenantId && candidate.userId === id,
    );
    const role = user.globalRole === "platform_admin" ? "platform_admin" : membership?.role || null;

    return {
      userId: user.id,
      displayName: user.displayName || user.email,
      ...(user.telegramUsername ? { telegramUsername: user.telegramUsername } : {}),
      ...(includeRole ? { role } : {}),
    };
  };
}

async function hydratedHousekeeping(database, event) {
  const housekeeping = housekeepingMetadata(event);
  const actor = await actorHydrator(database, event.tenantId);

  return {
    assignedTo: actor(housekeeping.assignedToUserId, true),
    assignedAt: housekeeping.assignedAt || null,
    bedDoneBy: actor(housekeeping.bedDoneByUserId),
    bedDoneAt: housekeeping.bedDoneAt || null,
    cleaningDoneBy: actor(housekeeping.cleaningDoneByUserId),
    cleaningDoneAt: housekeeping.cleaningDoneAt || null,
    completedBy: actor(housekeeping.completedByUserId),
    completedAt: housekeeping.completedAt || null,
  };
}

function publicRoom(room, { includeAccessCode = false } = {}) {
  return {
    roomId: room.id,
    roomNumber: room.number,
    roomName: room.name || "",
    status: room.status,
    ...(includeAccessCode ? { accessCode: room.accessCode ?? null } : {}),
  };
}

async function getTenant(database, tenantId) {
  const tenant = await database.getRecord("tenants", tenantId);

  if (!tenant || tenant.active === false) {
    const error = new Error("Tenant not found.");
    error.statusCode = 404;
    throw error;
  }

  return tenant;
}

async function getEventRoomContext(database, tenantId, eventId) {
  const event = await database.getTenantRecord("checkoutEvents", tenantId, eventId);

  if (!event) {
    const error = new Error("Checkout event not found.");
    error.statusCode = 404;
    throw error;
  }

  const room = await database.getTenantRecord("rooms", tenantId, event.roomId);

  if (!room || room.active === false || room.deletedAt) {
    const error = new Error("Room not found.");
    error.statusCode = 404;
    throw error;
  }

  return { event, room };
}

async function resolveEventId(database, tenant, input = {}) {
  const eventId = cleanString(input.eventId || input.checkoutEventId);
  if (eventId) {
    return eventId;
  }

  const roomNumber = cleanString(input.roomNumber);
  if (!roomNumber) {
    return "";
  }

  const timezone = tenant.basicInfo?.timezone || "UTC";
  const today = localDate(new Date(), timezone);
  const rooms = await database.listTenantRecords("rooms", tenant.id);
  const room = rooms.find(
    (candidate) =>
      candidate.active !== false &&
      !candidate.deletedAt &&
      String(candidate.number).toLowerCase() === roomNumber.toLowerCase(),
  );

  if (!room) {
    return "";
  }

  const candidates = (await database.listTenantRecords("checkoutEvents", tenant.id))
    .filter((event) => event.roomId === room.id && localDate(event.timestamp, timezone) === today)
    .sort((left, right) => new Date(right.timestamp) - new Date(left.timestamp));

  return candidates[0]?.id || "";
}

export async function getHousekeepingBoard(database, tenantId, options = {}) {
  const tenant = await getTenant(database, tenantId);
  const [rooms, events] = await Promise.all([
    database.listTenantRecords("rooms", tenant.id),
    database.listTenantRecords("checkoutEvents", tenant.id),
  ]);
  const timezone = tenant.basicInfo?.timezone || "UTC";
  const today = localDate(new Date(), timezone);
  const todayEvents = events.filter((event) => localDate(event.timestamp, timezone) === today);
  const eventByRoom = latestEventByRoom(todayEvents);
  const activeRooms = rooms
    .filter((room) => room.active !== false && !room.deletedAt)
    .sort((left, right) => String(left.number).localeCompare(String(right.number)));
  const pendingRows = activeRooms
    .filter((room) => PENDING_STATUSES.has(room.status) && eventByRoom.has(room.id))
    .map((room) => {
      const event = eventByRoom.get(room.id);
      const includeItemAccessCode =
        options.includeItemAccessCodes ?? options.includeAccessCodes !== false;

      return {
        ...publicRoom(room, { includeAccessCode: includeItemAccessCode }),
        eventId: event?.id || "",
        checkoutTimestamp: event?.timestamp || room.lastCheckoutAt || "",
        source: event?.source || room.lastCheckoutSource || "",
      };
    });
  const items = await Promise.all(
    pendingRows.map(async (item) => ({
      ...item,
      housekeeping: await hydratedHousekeeping(database, eventByRoom.get(item.roomId)),
    })),
  );
  const checkoutToday = activeRooms
    .filter((room) => String(room.checkoutDueDate || "").slice(0, 10) === today)
    .map((room) => ({
      ...publicRoom(room, {
        includeAccessCode:
          options.includeCheckoutAccessCodes ?? options.includeAccessCodes !== false,
      }),
      room: room.number,
      checkoutDueDate: String(room.checkoutDueDate).slice(0, 10),
      source: room.checkoutDueSource || "manual",
    }));
  const doneRows = activeRooms
    .filter(
      (room) =>
        room.status === "ready" &&
        room.lastCleanedAt &&
        localDate(room.lastCleanedAt, timezone) === today &&
        eventByRoom.has(room.id),
    )
    .map((room) => {
      const event = eventByRoom.get(room.id);
      return {
        ...publicRoom(room, {
          includeAccessCode:
            options.includeDoneAccessCodes ?? options.includeAccessCodes !== false,
        }),
        eventId: event.id,
        checkoutTimestamp: event.timestamp,
        cleanedTimestamp: room.lastCleanedAt,
        source: event.source,
      };
    });
  const done = await Promise.all(
    doneRows.map(async (item) => ({
      ...item,
      housekeeping: await hydratedHousekeeping(database, eventByRoom.get(item.roomId)),
    })),
  );
  const staleTelegramMessages = events
    .filter(
      (event) =>
        event.telegramMessageId &&
        event.telegramChatId &&
        !event.telegramMessageDeletedAt &&
        localDate(event.timestamp, timezone) < today,
    )
    .map((event) => ({
      eventId: event.id,
      messageId: event.telegramMessageId,
      chatId: event.telegramChatId,
      checkoutDate: localDate(event.timestamp, timezone),
    }));

  return {
    tenant: publicTenant(tenant),
    updatedAt: now(),
    date: today,
    timezone,
    checkoutToday,
    pendingCleaning: items,
    done,
    staleTelegramMessages,
    items,
    allRooms: activeRooms.map((room) => publicRoom(room, { includeAccessCode: false })),
    summary: {
      checkoutToday: checkoutToday.length,
      waiting: items.filter((item) => item.status === "ready_for_cleaning").length,
      cleaning: items.filter((item) => item.status === "cleaning").length,
      done: done.length,
      total: items.length,
    },
  };
}

export async function getHousekeepingStaff(database, tenantId, options = {}) {
  await getTenant(database, tenantId);
  const [users, memberships] = await Promise.all([
    database.listRecords("users"),
    database.listRecords("memberships"),
  ]);
  const usersById = new Map(users.map((user) => [user.id, user]));
  const members = memberships
    .filter((membership) => membership.tenantId === tenantId && MEMBER_ROLES.has(membership.role))
    .map((membership) => ({ membership, user: usersById.get(membership.userId) }))
    .filter(({ user }) => user && user.active !== false)
    .map(({ membership, user }) => ({
      userId: user.id,
      displayName: user.displayName || user.email,
      email: user.email,
      telegramUsername: cleanString(user.telegramUsername).replace(/^@/, ""),
      telegramLinked: Boolean(cleanString(user.telegramUserId)),
      role: membership.role,
    }));

  if (options.includePlatformAdmins) {
    for (const user of users.filter(
      (candidate) => candidate.active !== false && candidate.globalRole === "platform_admin",
    )) {
      if (!members.some((member) => member.userId === user.id)) {
        members.push({
          userId: user.id,
          displayName: user.displayName || user.email,
          email: user.email,
          telegramUsername: cleanString(user.telegramUsername).replace(/^@/, ""),
          telegramLinked: Boolean(cleanString(user.telegramUserId)),
          role: "platform_admin",
        });
      }
    }
  }

  return { success: true, tenantId, members };
}

export async function resolveAssignmentTargetByUserId(database, tenantId, userId) {
  const cleanUserId = cleanString(userId);
  if (!cleanUserId) {
    return undefined;
  }

  const user = await database.getRecord("users", cleanUserId);
  if (!user || user.active === false) {
    const error = new Error("Assignment target not found in this tenant.");
    error.statusCode = 400;
    throw error;
  }

  if (user.globalRole === "platform_admin") {
    return { user, role: "platform_admin" };
  }

  const membership = (await database.listRecords("memberships")).find(
    (candidate) => candidate.tenantId === tenantId && candidate.userId === cleanUserId,
  );

  if (!membership || !MEMBER_ROLES.has(membership.role)) {
    const error = new Error("Assignment target not found in this tenant.");
    error.statusCode = 400;
    throw error;
  }

  return { user, membership, role: membership.role };
}

export async function applyHousekeepingAction(database, input = {}) {
  const tenant = await getTenant(database, input.tenantId);
  const action = cleanString(input.action || input.type).toLowerCase();
  const actor = input.actor;

  if (!ALLOWED_ACTIONS.has(action) || !actor?.user?.id || !actor.role) {
    const error = new Error("Invalid housekeeping action.");
    error.statusCode = 400;
    throw error;
  }

  requireHousekeepingPermission(actor.role, action === "assign" ? "manage" : "use");
  const eventId = await resolveEventId(database, tenant, input);
  if (!eventId) {
    const error = new Error("An active checkout event is required.");
    error.statusCode = 404;
    throw error;
  }

  const { event, room } = await getEventRoomContext(database, tenant.id, eventId);
  const timestamp = now();
  const housekeeping = { ...housekeepingMetadata(event) };
  let assignedUserId = "";

  if (action === "claim") {
    if (
      housekeeping.assignedToUserId &&
      housekeeping.assignedToUserId !== actor.user.id &&
      !canManageHousekeeping(actor.role)
    ) {
      const error = new Error("Room is already assigned to another staff member.");
      error.statusCode = 403;
      throw error;
    }
    if (housekeeping.assignedToUserId !== actor.user.id) {
      Object.assign(housekeeping, {
        assignedToUserId: actor.user.id,
        assignedByUserId: actor.user.id,
        assignedAt: timestamp,
      });
    }
  } else if (action === "assign") {
    const target = await resolveAssignmentTargetByUserId(
      database,
      tenant.id,
      input.assignmentTargetUserId || input.assignedToUserId,
    );
    if (!target) {
      const error = new Error("Assignment target is required.");
      error.statusCode = 400;
      throw error;
    }
    assignedUserId = target.user.id;
    Object.assign(housekeeping, {
      assignedToUserId: target.user.id,
      assignedByUserId: actor.user.id,
      assignedAt: timestamp,
    });
  } else if (action === "bed_done" && !housekeeping.bedDoneAt) {
    Object.assign(housekeeping, { bedDoneByUserId: actor.user.id, bedDoneAt: timestamp });
  } else if (action === "cleaning_done" && !housekeeping.cleaningDoneAt) {
    Object.assign(housekeeping, {
      cleaningDoneByUserId: actor.user.id,
      cleaningDoneAt: timestamp,
    });
  } else if (action === "complete") {
    if (!housekeeping.bedDoneAt) {
      Object.assign(housekeeping, { bedDoneByUserId: actor.user.id, bedDoneAt: timestamp });
    }
    if (!housekeeping.cleaningDoneAt) {
      Object.assign(housekeeping, {
        cleaningDoneByUserId: actor.user.id,
        cleaningDoneAt: timestamp,
      });
    }
    if (!housekeeping.completedAt) {
      Object.assign(housekeeping, { completedByUserId: actor.user.id, completedAt: timestamp });
    }
  }

  const updatedEvent = await database.setRecord("checkoutEvents", event.id, {
    ...event,
    metadata: { ...(event.metadata || {}), housekeeping },
  });
  let updatedRoom = room;

  if (action === "claim" && room.status === "ready_for_cleaning") {
    updatedRoom = await updateRoom(database, tenant.id, room.id, { status: "cleaning" });
  }

  if (action === "complete") {
    updatedRoom = await updateRoom(database, tenant.id, room.id, { status: "ready" });
    void sendRoomCompletedPush(database, {
      tenant,
      room: updatedRoom,
      event: updatedEvent,
      actorUser: actor.user,
    }).catch((error) => {
      const message = error instanceof Error ? error.message : "unknown error";
      console.warn(`[WebPush] room completed push failed: ${message}`);
    });
  }

  if (action === "assign" && assignedUserId) {
    void sendAssignmentPush(database, {
      tenant,
      room: updatedRoom,
      event: updatedEvent,
      assignedUserId,
    }).catch((error) => {
      const message = error instanceof Error ? error.message : "unknown error";
      console.warn(`[WebPush] assignment push failed: ${message}`);
    });
  }

  return {
    success: true,
    action,
    event: updatedEvent,
    room: updatedRoom,
    board: await getHousekeepingBoard(database, tenant.id),
  };
}

export async function registerManualHousekeepingCheckout(database, input = {}) {
  const tenant = await getTenant(database, input.tenantId);
  const actor = input.actor;

  if (!actor?.user?.id || !actor.role) {
    const error = new Error("Invalid housekeeping actor.");
    error.statusCode = 400;
    throw error;
  }

  requireHousekeepingPermission(actor.role, "manage");
  const roomId = cleanString(input.roomId);
  const roomNumber = cleanString(input.roomNumber);
  const rooms = await database.listTenantRecords("rooms", tenant.id);
  const room = rooms.find(
    (candidate) =>
      candidate.active !== false &&
      !candidate.deletedAt &&
      ((roomId && candidate.id === roomId) ||
        (roomNumber && String(candidate.number).toLowerCase() === roomNumber.toLowerCase())),
  );

  if (!room) {
    const error = new Error("Room not found.");
    error.statusCode = 404;
    throw error;
  }

  const target = await resolveAssignmentTargetByUserId(
    database,
    tenant.id,
    input.assignmentTargetUserId || input.assignedToUserId,
  );
  const timestamp = now();
  const metadata = {
    origin: cleanString(input.origin) || "hotelapp",
    actorUserId: actor.user.id,
    ...(cleanString(input.actorTelegramUserId)
      ? { actorTelegramUserId: cleanString(input.actorTelegramUserId) }
      : {}),
    ...(target
      ? {
          housekeeping: {
            assignedToUserId: target.user.id,
            assignedByUserId: actor.user.id,
            assignedAt: timestamp,
          },
        }
      : {}),
  };
  const result = await registerCheckout(database, tenant.id, room.id, "manual", {
    sourceIdentifier: `manual:${actor.user.id}`,
    metadata,
  });

  if (!result.duplicate && target) {
    void sendAssignmentPush(database, {
      tenant,
      room: result.room,
      event: result.event,
      assignedUserId: target.user.id,
    }).catch((error) => {
      const message = error instanceof Error ? error.message : "unknown error";
      console.warn(`[WebPush] manual checkout assignment push failed: ${message}`);
    });
  }

  return {
    success: true,
    duplicate: result.duplicate,
    tenantId: tenant.id,
    event: result.event,
    room: result.room,
  };
}

export async function countPendingHousekeepingRooms(database, tenantId) {
  const board = await getHousekeepingBoard(database, tenantId, { includeAccessCodes: false });
  return board.summary.total;
}
