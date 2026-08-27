import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import webpush from "web-push";
import {
  applyHousekeepingAction,
  getHousekeepingBoard,
  registerManualHousekeepingCheckout,
} from "./housekeepingService.js";
import { createRoom, registerCheckout } from "./checkoutService.js";
import { setWebPushTestHooks, subscribeUserPush, updatePushPreference } from "./webPushService.js";

function createFakeDatabase(initial = {}) {
  const data = {
    tenants: {},
    tenantSettings: {},
    rooms: {},
    checkoutEvents: {},
    occupancyCycles: {},
    users: {},
    memberships: {},
    webPushConfigs: {},
    pushSubscriptions: {},
    pushPreferences: {},
    scheduledPushes: {},
    diagnostics: {},
    ...initial,
  };

  return {
    data,
    async setRecord(collection, id, value) {
      data[collection] ||= {};
      data[collection][id] = { ...value, id };
      return data[collection][id];
    },
    async getRecord(collection, id) {
      return data[collection]?.[id];
    },
    async listRecords(collection) {
      return Object.values(data[collection] || {});
    },
    async listTenantRecords(collection, tenantId) {
      return Object.values(data[collection] || {}).filter((record) => record.tenantId === tenantId);
    },
    async getTenantRecord(collection, tenantId, id) {
      const record = data[collection]?.[id];
      return record?.tenantId === tenantId ? record : undefined;
    },
    async deleteRecord(collection, id) {
      delete data[collection]?.[id];
    },
    async ensureCurrentOccupancyCycle({
      tenantId,
      roomId,
      reason = "ready",
      metadata = {},
    }) {
      const current = Object.values(data.occupancyCycles).find(
        (cycle) => cycle.tenantId === tenantId && cycle.roomId === roomId && !cycle.consumedAt,
      );

      if (current) {
        current.metadata = { ...(current.metadata || {}), ...metadata };
        return { cycle: current, created: false };
      }

      const cycleNumber =
        Object.values(data.occupancyCycles)
          .filter((cycle) => cycle.tenantId === tenantId && cycle.roomId === roomId)
          .reduce((highest, cycle) => Math.max(highest, Number(cycle.cycleNumber || 0)), 0) + 1;
      const cycle = {
        id: randomUUID(),
        tenantId,
        roomId,
        cycleNumber,
        openedAt: new Date().toISOString(),
        createdReason: reason,
        consumedAt: null,
        metadata,
      };
      data.occupancyCycles[cycle.id] = cycle;
      return { cycle, created: true };
    },
  };
}

function baseDatabase() {
  return createFakeDatabase({
    tenants: {
      "hotel-a": {
        id: "hotel-a",
        name: "Hotel A",
        slug: "hotel-a",
        active: true,
        basicInfo: { timezone: "UTC" },
      },
    },
    tenantSettings: {
      "hotel-a": {
        tenantId: "hotel-a",
        notifications: { telegram: { enabled: true, chatId: "chat-a" } },
      },
    },
    users: {
      staff: { id: "staff", email: "staff@example.test", displayName: "Staff", active: true },
      manager: { id: "manager", email: "manager@example.test", displayName: "Manager", active: true },
      other: { id: "other", email: "other@example.test", displayName: "Other", active: true },
    },
    memberships: {
      staff: { id: "staff-member", tenantId: "hotel-a", userId: "staff", role: "staff" },
      manager: { id: "manager-member", tenantId: "hotel-a", userId: "manager", role: "manager" },
      other: { id: "other-member", tenantId: "hotel-a", userId: "other", role: "staff" },
    },
  });
}

function actor(database, userId) {
  const user = database.data.users[userId];
  const membership = Object.values(database.data.memberships).find(
    (candidate) => candidate.userId === userId,
  );

  return { user, role: user.globalRole === "platform_admin" ? "platform_admin" : membership.role };
}

function browserSubscription(endpoint) {
  return {
    endpoint,
    keys: { p256dh: `p256dh-${endpoint}`, auth: `auth-${endpoint}` },
  };
}

function validVapidKeys() {
  return webpush.generateVAPIDKeys();
}

async function flushAsyncNotifications() {
  await new Promise((resolve) => setImmediate(resolve));
}

test("dashboard housekeeping board uses real CheckoutEvents and exposes accessCode only inside app", async () => {
  const database = baseDatabase();
  const dueOnly = await createRoom(database, "hotel-a", {
    number: "101",
    status: "ready_for_cleaning",
    accessCode: "1111",
  });
  const checkedOut = await createRoom(database, "hotel-a", {
    number: "102",
    status: "occupied",
    accessCode: "4832",
  });
  database.data.rooms[dueOnly.id].checkoutDueDate = new Date().toISOString().slice(0, 10);

  let board = await getHousekeepingBoard(database, "hotel-a");
  assert.equal(board.items.length, 0);
  assert.equal(board.checkoutToday.length, 1);

  const checkout = await registerCheckout(database, "hotel-a", checkedOut.id, "manual");
  await flushAsyncNotifications();
  board = await getHousekeepingBoard(database, "hotel-a");

  assert.deepEqual(board.items.map((item) => item.eventId), [checkout.event.id]);
  assert.equal(board.items[0].roomNumber, "102");
  assert.equal(board.items[0].accessCode, "4832");
});

test("staff cannot register manual checkout while manager can", async () => {
  const database = baseDatabase();
  const room = await createRoom(database, "hotel-a", { number: "201", status: "occupied" });

  await assert.rejects(
    () =>
      registerManualHousekeepingCheckout(database, {
        tenantId: "hotel-a",
        actor: actor(database, "staff"),
        roomId: room.id,
      }),
    /Manager access/,
  );

  const result = await registerManualHousekeepingCheckout(database, {
    tenantId: "hotel-a",
    actor: actor(database, "manager"),
    roomId: room.id,
  });
  await flushAsyncNotifications();

  assert.equal(result.success, true);
  assert.equal(result.event.source, "manual");
  assert.equal(result.event.metadata.origin, "hotelapp");
});

test("claim, bed_done, cleaning_done and direct complete update housekeeping state", async () => {
  const database = baseDatabase();
  const room = await createRoom(database, "hotel-a", { number: "301", status: "occupied" });
  const checkout = await registerCheckout(database, "hotel-a", room.id, "manual");
  await flushAsyncNotifications();

  await applyHousekeepingAction(database, {
    tenantId: "hotel-a",
    actor: actor(database, "staff"),
    action: "claim",
    eventId: checkout.event.id,
  });
  assert.equal(database.data.rooms[room.id].status, "cleaning");

  await applyHousekeepingAction(database, {
    tenantId: "hotel-a",
    actor: actor(database, "staff"),
    action: "bed_done",
    eventId: checkout.event.id,
  });
  await applyHousekeepingAction(database, {
    tenantId: "hotel-a",
    actor: actor(database, "staff"),
    action: "cleaning_done",
    eventId: checkout.event.id,
  });
  await applyHousekeepingAction(database, {
    tenantId: "hotel-a",
    actor: actor(database, "staff"),
    action: "complete",
    eventId: checkout.event.id,
  });
  await flushAsyncNotifications();

  const housekeeping = database.data.checkoutEvents[checkout.event.id].metadata.housekeeping;
  assert.equal(housekeeping.assignedToUserId, "staff");
  assert.equal(housekeeping.bedDoneByUserId, "staff");
  assert.equal(housekeeping.cleaningDoneByUserId, "staff");
  assert.equal(housekeeping.completedByUserId, "staff");
  assert.equal(database.data.rooms[room.id].status, "ready");
});

test("complete directly fills missing bed and cleaning while preserving existing authors", async () => {
  const database = baseDatabase();
  const room = await createRoom(database, "hotel-a", { number: "302", status: "occupied" });
  const checkout = await registerCheckout(database, "hotel-a", room.id, "manual");
  await flushAsyncNotifications();

  await applyHousekeepingAction(database, {
    tenantId: "hotel-a",
    actor: actor(database, "other"),
    action: "bed_done",
    eventId: checkout.event.id,
  });
  const priorBedAt = database.data.checkoutEvents[checkout.event.id].metadata.housekeeping.bedDoneAt;

  await applyHousekeepingAction(database, {
    tenantId: "hotel-a",
    actor: actor(database, "staff"),
    action: "complete",
    eventId: checkout.event.id,
  });
  await flushAsyncNotifications();

  const housekeeping = database.data.checkoutEvents[checkout.event.id].metadata.housekeeping;
  assert.equal(housekeeping.bedDoneByUserId, "other");
  assert.equal(housekeeping.bedDoneAt, priorBedAt);
  assert.equal(housekeeping.cleaningDoneByUserId, "staff");
  assert.equal(housekeeping.completedByUserId, "staff");
});

test("checkout Web Push excludes accessCode and does not break checkout when push fails", async () => {
  const sent = [];
  const database = baseDatabase();
  const room = await createRoom(database, "hotel-a", {
    number: "401",
    status: "occupied",
    accessCode: "9999",
  });
  const reset = setWebPushTestHooks({
    generateVapidKeys: validVapidKeys,
    sendNotification: async (subscription, payload) => {
      sent.push({ subscription, payload: JSON.parse(payload) });
      throw new Error("push provider unavailable");
    },
  });

  try {
    await subscribeUserPush(database, {
      userId: "staff",
      tenantId: "hotel-a",
      subscription: browserSubscription("endpoint-staff"),
    });
    await updatePushPreference(database, "staff", "hotel-a", { enabled: true, newCheckout: true });
    const result = await registerCheckout(database, "hotel-a", room.id, "manual");
    await flushAsyncNotifications();

    assert.equal(result.duplicate, false);
    assert.equal(database.data.checkoutEvents[result.event.id].roomId, room.id);
    assert.equal(sent.length, 1);
    assert.equal(JSON.stringify(sent[0].payload).includes("9999"), false);
    assert.equal(sent[0].payload.roomNumber, "401");
  } finally {
    reset();
  }
});

test("assignment sends Web Push only to the assigned user", async () => {
  const sent = [];
  const database = baseDatabase();
  const room = await createRoom(database, "hotel-a", { number: "501", status: "occupied" });
  const checkout = await registerCheckout(database, "hotel-a", room.id, "manual");
  const reset = setWebPushTestHooks({
    generateVapidKeys: validVapidKeys,
    sendNotification: async (subscription, payload) => {
      sent.push({ endpoint: subscription.endpoint, payload: JSON.parse(payload) });
    },
  });

  try {
    await subscribeUserPush(database, {
      userId: "staff",
      tenantId: "hotel-a",
      subscription: browserSubscription("endpoint-staff"),
    });
    await subscribeUserPush(database, {
      userId: "other",
      tenantId: "hotel-a",
      subscription: browserSubscription("endpoint-other"),
    });
    await updatePushPreference(database, "staff", "hotel-a", { enabled: true, assignedToMe: true, newCheckout: false });
    await updatePushPreference(database, "other", "hotel-a", { enabled: true, assignedToMe: true, newCheckout: false });

    await applyHousekeepingAction(database, {
      tenantId: "hotel-a",
      actor: actor(database, "manager"),
      action: "assign",
      eventId: checkout.event.id,
      assignmentTargetUserId: "staff",
    });
    await flushAsyncNotifications();

    assert.deepEqual(sent.map((item) => item.endpoint), ["endpoint-staff"]);
    assert.equal(sent[0].payload.type, "housekeeping.assigned");
    assert.equal(sent[0].payload.roomNumber, "501");
  } finally {
    reset();
  }
});
