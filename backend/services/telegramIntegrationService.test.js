import test from "node:test";
import assert from "node:assert/strict";
import {
  connectTelegramChat,
  createTelegramPairingCode,
  disconnectTelegramChat,
  getHousekeepingBoard,
  handleHousekeepingAction,
  saveHousekeepingBoardMessage,
  validateTelegramIntegrationSecret,
} from "./telegramIntegrationService.js";
import {
  createRoom,
  registerCheckout,
  updateRoom,
} from "./checkoutService.js";

function createFakeDatabase(initial = {}) {
  const data = {
    tenants: {},
    tenantSettings: {},
    diagnostics: {},
    rooms: {},
    checkoutEvents: {},
    occupancyCycles: {},
    keyIdentifiers: {},
    ...initial,
  };

  return {
    data,
    async listRecords(collection) {
      return Object.values(data[collection] || {});
    },
    async listTenantRecords(collection, tenantId) {
      return Object.values(data[collection] || {}).filter((record) => record.tenantId === tenantId);
    },
    async getRecord(collection, id) {
      return data[collection]?.[id];
    },
    async getTenantRecord(collection, tenantId, id) {
      const record = data[collection]?.[id];
      return record?.tenantId === tenantId ? record : undefined;
    },
    async setRecord(collection, id, value) {
      data[collection] ||= {};
      data[collection][id] = { ...value, id };
      return data[collection][id];
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
        id: `cycle-${cycleNumber}`,
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
    async registerCheckoutForCurrentCycle(input) {
      const room = data.rooms[input.roomId];
      const current = Object.values(data.occupancyCycles).find(
        (cycle) => cycle.tenantId === input.tenantId && cycle.roomId === input.roomId && !cycle.consumedAt,
      );
      const cycle =
        current ||
        (
          await this.ensureCurrentOccupancyCycle({
            tenantId: input.tenantId,
            roomId: input.roomId,
            reason: "checkout_recovery",
          })
        ).cycle;
      const timestamp = new Date().toISOString();
      const event = {
        id: input.id,
        tenantId: input.tenantId,
        roomId: input.roomId,
        occupancyCycleId: cycle.id,
        source: input.source,
        sourceIdentifier: input.sourceIdentifier,
        status: "registered",
        timestamp,
        metadata: input.metadata || {},
      };
      data.checkoutEvents[event.id] = event;
      data.occupancyCycles[cycle.id] = { ...cycle, consumedAt: timestamp };
      data.rooms[room.id] = {
        ...room,
        status: "ready_for_cleaning",
        lastCheckoutAt: timestamp,
        lastCheckoutSource: input.source,
        updatedAt: timestamp,
      };
      return { duplicate: false, event, room: data.rooms[room.id] };
    },
  };
}

function withTelegramSecret(secret, callback) {
  const originalSecret = process.env.N8N_CHECKOUT_WEBHOOK_SECRET;
  process.env.N8N_CHECKOUT_WEBHOOK_SECRET = secret;

  return Promise.resolve()
    .then(callback)
    .finally(() => {
      if (originalSecret === undefined) {
        delete process.env.N8N_CHECKOUT_WEBHOOK_SECRET;
      } else {
        process.env.N8N_CHECKOUT_WEBHOOK_SECRET = originalSecret;
      }
    });
}

test("Telegram pairing code is tenant-scoped and expires in about 10 minutes", async () => {
  const database = createFakeDatabase({
    tenants: {
      "hotel-a": { id: "hotel-a", name: "Hotel A", slug: "hotel-a", active: true },
    },
  });

  const pairing = await createTelegramPairingCode(database, "hotel-a");

  assert.match(pairing.code, /^[A-Z2-9]{6}$/);
  assert.deepEqual(pairing.tenant, { id: "hotel-a", name: "Hotel A", slug: "hotel-a" });
  assert.equal(database.data.diagnostics.telegramPairingCodes.codes[pairing.code].tenantId, "hotel-a");
  assert.ok(new Date(pairing.expiresAt).getTime() - Date.now() <= 10 * 60 * 1000);
});

test("Telegram connect stores tenant settings and invalidates the code", async () => {
  const database = createFakeDatabase({
    tenants: {
      "hotel-a": { id: "hotel-a", name: "Hotel A", slug: "hotel-a", active: true },
    },
  });
  const pairing = await createTelegramPairingCode(database, "hotel-a");

  const result = await connectTelegramChat(database, {
    code: pairing.code,
    chatId: "-100123456789",
    chatTitle: "Housekeeping Hotel A",
    chatType: "supergroup",
    telegramUserId: "42",
    telegramUsername: "admin",
  });

  assert.equal(result.success, true);
  assert.deepEqual(result.tenant, { id: "hotel-a", name: "Hotel A", slug: "hotel-a" });
  assert.deepEqual(database.data.tenantSettings["hotel-a"].notifications.telegram, {
    enabled: true,
    chatId: "-100123456789",
    chatTitle: "Housekeeping Hotel A",
    chatType: "supergroup",
    connectedAt: database.data.tenantSettings["hotel-a"].notifications.telegram.connectedAt,
    telegramUserId: "42",
    telegramUsername: "admin",
    diagnostics: {
      lastAttemptAt: "",
      lastSuccessAt: "",
      lastError: "",
      httpStatus: undefined,
      checkoutEventId: "",
      room: "",
      source: "",
    },
  });
  assert.equal(database.data.diagnostics.telegramPairingCodes.codes[pairing.code], undefined);

  const reused = await connectTelegramChat(database, {
    code: pairing.code,
    chatId: "-100000000000",
  });
  assert.deepEqual(reused, { success: false, error: "Invalid or expired pairing code." });
});

test("expired Telegram pairing code cannot connect", async () => {
  const database = createFakeDatabase({
    tenants: {
      "hotel-a": { id: "hotel-a", name: "Hotel A", slug: "hotel-a", active: true },
    },
    diagnostics: {
      telegramPairingCodes: {
        codes: {
          ABC742: {
            code: "ABC742",
            tenantId: "hotel-a",
            createdAt: new Date(Date.now() - 15 * 60 * 1000).toISOString(),
            expiresAt: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
          },
        },
      },
    },
  });

  const result = await connectTelegramChat(database, {
    code: "ABC742",
    chatId: "-100123456789",
  });

  assert.deepEqual(result, { success: false, error: "Invalid or expired pairing code." });
  assert.equal(database.data.tenantSettings["hotel-a"], undefined);
});

test("Telegram integration secret validates n8n calls", async () => {
  await withTelegramSecret("shared-secret", async () => {
    assert.equal(
      validateTelegramIntegrationSecret({ "x-hotelapp-secret": "shared-secret" }),
      true,
    );
    assert.equal(validateTelegramIntegrationSecret({ "x-hotelapp-secret": "wrong" }), false);
  });
});

test("disconnect Telegram clears chat settings", async () => {
  const database = createFakeDatabase({
    tenants: {
      "hotel-a": { id: "hotel-a", name: "Hotel A", slug: "hotel-a", active: true },
    },
    tenantSettings: {
      "hotel-a": {
        tenantId: "hotel-a",
        notifications: {
          telegram: {
            enabled: true,
            chatId: "-100123456789",
            chatTitle: "Housekeeping Hotel A",
            chatType: "supergroup",
            connectedAt: new Date().toISOString(),
          },
        },
      },
    },
  });

  await disconnectTelegramChat(database, "hotel-a");

  assert.deepEqual(database.data.tenantSettings["hotel-a"].notifications.telegram, {
    enabled: false,
    chatId: "",
    chatTitle: "",
    chatType: "",
    connectedAt: "",
    telegramUserId: "",
    telegramUsername: "",
    diagnostics: {
      lastAttemptAt: "",
      lastSuccessAt: "",
      lastError: "",
      httpStatus: undefined,
      checkoutEventId: "",
      room: "",
      source: "",
    },
  });
});

test("Telegram housekeeping Ready uses private double confirmation and creates one next cycle", async () => {
  const calls = [];
  const originalFetch = global.fetch;
  const originalUrl = process.env.N8N_CHECKOUT_WEBHOOK_URL;
  const originalSecret = process.env.N8N_CHECKOUT_WEBHOOK_SECRET;
  global.fetch = async (...args) => {
    calls.push(args);
    return { ok: true, status: 200 };
  };
  process.env.N8N_CHECKOUT_WEBHOOK_URL = "https://n8n.example.test/webhook/checkout";
  process.env.N8N_CHECKOUT_WEBHOOK_SECRET = "shared-secret";

  try {
    const database = createFakeDatabase({
      tenants: {
        "hotel-a": { id: "hotel-a", name: "Hotel A", slug: "hotel-a", active: true },
      },
      tenantSettings: {
        "hotel-a": {
          tenantId: "hotel-a",
          notifications: {
            telegram: {
              enabled: true,
              chatId: "-100123456789",
            },
          },
        },
      },
    });
    const room = await createRoom(database, "hotel-a", { number: "109", status: "occupied" });
    const checkout = await registerCheckout(database, "hotel-a", room.id, "manual", {
      sourceIdentifier: "manual:test",
    });
    const board = await getHousekeepingBoard(database, { tenantId: "hotel-a" });

    assert.equal(calls.length, 1);
    assert.equal(board.items.length, 1);
    assert.equal(board.items[0].eventId, checkout.event.id);

    const savedBoard = await saveHousekeepingBoardMessage(database, {
      tenantId: "hotel-a",
      chatId: "-100123456789",
      messageId: "77",
    });

    assert.equal(savedBoard.board.messageId, "77");

    const firstClick = await handleHousekeepingAction(database, {
      tenantId: "hotel-a",
      action: "ready",
      eventId: checkout.event.id,
      chatId: "-100123456789",
      telegramUserId: "42",
    });

    assert.equal(firstClick.confirmationRequired, true);
    assert.equal(database.data.rooms[room.id].status, "ready_for_cleaning");
    assert.equal(Object.values(database.data.occupancyCycles).length, 1);

    const secondClick = await handleHousekeepingAction(database, {
      tenantId: "hotel-a",
      action: "ready",
      eventId: checkout.event.id,
      chatId: "-100123456789",
      telegramUserId: "42",
    });

    assert.equal(secondClick.confirmed, true);
    assert.equal(secondClick.board.items.length, 0);
    assert.equal(database.data.rooms[room.id].status, "ready");
    assert.equal(Object.values(database.data.occupancyCycles).length, 2);
    assert.equal(
      Object.values(database.data.occupancyCycles).filter(
        (cycle) => cycle.roomId === room.id && !cycle.consumedAt,
      ).length,
      1,
    );
    assert.equal(calls.length, 1);
  } finally {
    global.fetch = originalFetch;
    if (originalUrl === undefined) {
      delete process.env.N8N_CHECKOUT_WEBHOOK_URL;
    } else {
      process.env.N8N_CHECKOUT_WEBHOOK_URL = originalUrl;
    }
    if (originalSecret === undefined) {
      delete process.env.N8N_CHECKOUT_WEBHOOK_SECRET;
    } else {
      process.env.N8N_CHECKOUT_WEBHOOK_SECRET = originalSecret;
    }
  }
});
