import test from "node:test";
import assert from "node:assert/strict";
import {
  createKeyIdentifier,
  createRoom,
  checkoutIdentifierFromValue,
  listCheckoutOverview,
  registerCheckout,
  registerCheckoutByIdentifier,
  resolveCheckoutByIdentifier,
  updateKeyIdentifier,
} from "./checkoutService.js";
import { requireModule } from "./tenantService.js";

function createFakeDatabase(initial = {}) {
  const data = {
    tenants: {},
    tenantModules: {},
    rooms: {},
    keyIdentifiers: {},
    checkoutEvents: {},
    tenantSettings: {},
    ...initial,
  };

  return {
    data,
    async setRecord(collection, id, value) {
      data[collection][id] = { ...value, id };
      return data[collection][id];
    },
    async getRecord(collection, id) {
      return data[collection][id];
    },
    async listRecords(collection) {
      return Object.values(data[collection]);
    },
    async listTenantRecords(collection, tenantId) {
      return Object.values(data[collection]).filter((record) => record.tenantId === tenantId);
    },
    async getTenantRecord(collection, tenantId, id) {
      const record = data[collection][id];
      return record?.tenantId === tenantId ? record : undefined;
    },
    async getTenantModules(tenantId) {
      return Object.fromEntries(
        Object.values(data.tenantModules[tenantId] || {}).map((module) => [
          module.moduleId,
          module.enabled,
        ]),
      );
    },
    async setTenantModule(tenantId, moduleId, enabled) {
      data.tenantModules[tenantId] ||= {};
      data.tenantModules[tenantId][moduleId] = { tenantId, moduleId, enabled };
      return data.tenantModules[tenantId][moduleId];
    },
  };
}

function withN8nCheckoutWebhook(fetchImplementation, callback) {
  const originalFetch = global.fetch;
  const originalUrl = process.env.N8N_CHECKOUT_WEBHOOK_URL;
  const originalSecret = process.env.N8N_CHECKOUT_WEBHOOK_SECRET;

  global.fetch = fetchImplementation;
  process.env.N8N_CHECKOUT_WEBHOOK_URL = "https://n8n.example.test/webhook/checkout";
  process.env.N8N_CHECKOUT_WEBHOOK_SECRET = "shared-secret";

  return Promise.resolve()
    .then(callback)
    .finally(() => {
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
    });
}

function createNotificationDatabase({ tenantId = "hotelA", enabled = true, chatId = "chat-a" } = {}) {
  return createFakeDatabase({
    tenants: {
      [tenantId]: { id: tenantId, name: "Hotel A", slug: "hotel-a", active: true },
    },
    tenantSettings: {
      [tenantId]: {
        tenantId,
        notifications: {
          telegram: { enabled, chatId, botToken: "legacy-token" },
        },
      },
    },
  });
}

function parseWebhookCall(call) {
  return {
    url: call[0],
    init: call[1],
    payload: JSON.parse(call[1].body),
  };
}

test("module entitlement is enforced per tenant", async () => {
  const database = createFakeDatabase({
    tenantModules: {
      hotelA: { checkout: { moduleId: "checkout", enabled: true } },
      hotelB: { checkout: { moduleId: "checkout", enabled: false } },
    },
  });

  await assert.doesNotReject(() =>
    requireModule(database, { activeTenantId: "hotelA" }, "checkout"),
  );
  await assert.rejects(
    () => requireModule(database, { activeTenantId: "hotelB" }, "checkout"),
    /not enabled/,
  );
});

test("QR checkout sends n8n webhook", async () => {
  const calls = [];
  const database = createNotificationDatabase();
  const room = await createRoom(database, "hotelA", { number: "109" });
  const key = await createKeyIdentifier(database, "hotelA", { roomId: room.id });

  await withN8nCheckoutWebhook(async (...args) => {
    calls.push(args);
    return { ok: true, status: 200 };
  }, async () => {
    const result = await registerCheckoutByIdentifier(database, key.identifier, "qr");

    assert.equal(result.duplicate, false);
    assert.equal(calls.length, 1);
    const { url, init, payload } = parseWebhookCall(calls[0]);
    assert.equal(url, "https://n8n.example.test/webhook/checkout");
    assert.equal(init.headers["X-HotelApp-Secret"], "shared-secret");
    assert.equal(payload.event, "checkout.completed");
    assert.equal(payload.checkout.source, "qr");
    assert.equal(payload.room.number, "109");
  });
});

test("manual checkout sends n8n webhook", async () => {
  const calls = [];
  const database = createNotificationDatabase();
  const room = await createRoom(database, "hotelA", { number: "204" });

  await withN8nCheckoutWebhook(async (...args) => {
    calls.push(args);
    return { ok: true, status: 200 };
  }, async () => {
    const result = await registerCheckout(database, "hotelA", room.id, "manual");

    assert.equal(result.duplicate, false);
    assert.equal(calls.length, 1);
    assert.equal(parseWebhookCall(calls[0]).payload.checkout.source, "manual");
  });
});

test("checkout webhook uses the correct tenant and chatId", async () => {
  const calls = [];
  const database = createFakeDatabase({
    tenants: {
      hotelA: { id: "hotelA", name: "Hotel A", slug: "hotel-a", active: true },
      hotelB: { id: "hotelB", name: "Hotel B", slug: "hotel-b", active: true },
    },
    tenantSettings: {
      hotelA: {
        tenantId: "hotelA",
        notifications: { telegram: { enabled: true, chatId: "chat-a" } },
      },
      hotelB: {
        tenantId: "hotelB",
        notifications: { telegram: { enabled: true, chatId: "chat-b" } },
      },
    },
  });
  const room = await createRoom(database, "hotelB", { number: "305", name: "Suite" });

  await withN8nCheckoutWebhook(async (...args) => {
    calls.push(args);
    return { ok: true, status: 200 };
  }, async () => {
    await registerCheckout(database, "hotelB", room.id, "manual");

    assert.equal(calls.length, 1);
    const { payload } = parseWebhookCall(calls[0]);
    assert.deepEqual(payload.tenant, {
      id: "hotelB",
      slug: "hotel-b",
      name: "Hotel B",
    });
    assert.equal(payload.notification.chatId, "chat-b");
    assert.equal(payload.room.id, room.id);
    assert.equal(payload.room.name, "Suite");
  });
});

test("duplicate checkout does not send another n8n webhook", async () => {
  const calls = [];
  const database = createNotificationDatabase();
  const room = await createRoom(database, "hotelA", { number: "109" });
  const key = await createKeyIdentifier(database, "hotelA", { roomId: room.id });

  await withN8nCheckoutWebhook(async (...args) => {
    calls.push(args);
    return { ok: true, status: 200 };
  }, async () => {
    const first = await registerCheckoutByIdentifier(database, key.identifier, "qr");
    const second = await registerCheckoutByIdentifier(database, key.identifier, "qr");

    assert.equal(first.duplicate, false);
    assert.equal(second.duplicate, true);
    assert.equal(calls.length, 1);
  });
});

test("n8n webhook failure does not break checkout registration", async () => {
  const database = createNotificationDatabase();
  const room = await createRoom(database, "hotelA", { number: "109" });
  const warnings = [];
  const originalWarn = console.warn;
  console.warn = (...args) => warnings.push(args.join(" "));

  try {
    await withN8nCheckoutWebhook(async () => {
      throw new Error("n8n unavailable");
    }, async () => {
      const result = await registerCheckout(database, "hotelA", room.id, "manual");
      await new Promise((resolve) => setImmediate(resolve));

      assert.equal(result.duplicate, false);
      assert.equal(Object.values(database.data.checkoutEvents).length, 1);
      assert.equal(warnings.some((warning) => warning.includes("n8n checkout webhook failed")), true);
    });
  } finally {
    console.warn = originalWarn;
  }
});

test("disabled Telegram notifications do not call n8n webhook", async () => {
  const calls = [];
  const database = createNotificationDatabase({ enabled: false, chatId: "chat-a" });
  const room = await createRoom(database, "hotelA", { number: "109" });

  await withN8nCheckoutWebhook(async (...args) => {
    calls.push(args);
    return { ok: true, status: 200 };
  }, async () => {
    const result = await registerCheckout(database, "hotelA", room.id, "manual");

    assert.equal(result.duplicate, false);
    assert.equal(calls.length, 0);
  });
});

test("missing Telegram chatId does not call n8n webhook", async () => {
  const calls = [];
  const database = createNotificationDatabase({ enabled: true, chatId: "" });
  const room = await createRoom(database, "hotelA", { number: "109" });

  await withN8nCheckoutWebhook(async (...args) => {
    calls.push(args);
    return { ok: true, status: 200 };
  }, async () => {
    const result = await registerCheckout(database, "hotelA", room.id, "manual");

    assert.equal(result.duplicate, false);
    assert.equal(calls.length, 0);
  });
});

test("tenant-scoped room listing never returns another tenant room", async () => {
  const database = createFakeDatabase();
  await database.setRecord("rooms", "a-room", {
    id: "a-room",
    tenantId: "hotelA",
    number: "101",
    active: true,
    status: "unknown",
  });
  await database.setRecord("rooms", "b-room", {
    id: "b-room",
    tenantId: "hotelB",
    number: "202",
    active: true,
    status: "unknown",
  });

  const overview = await listCheckoutOverview(database, "hotelA");

  assert.deepEqual(
    overview.rooms.map((room) => room.number),
    ["101"],
  );
});

test("QR identifier resolves room, updates room state and is idempotent", async () => {
  const database = createFakeDatabase();
  const room = await createRoom(database, "hotelA", { number: "109" });
  const key = await createKeyIdentifier(database, "hotelA", { roomId: room.id });

  const first = await registerCheckoutByIdentifier(database, key.identifier, "qr");
  const second = await registerCheckoutByIdentifier(database, key.identifier, "qr");
  const updatedRoom = await database.getTenantRecord("rooms", "hotelA", room.id);

  assert.equal(first.duplicate, false);
  assert.equal(second.duplicate, true);
  assert.equal(updatedRoom.status, "ready_for_cleaning");
  assert.equal(Object.values(database.data.checkoutEvents).length, 1);
});

test("direct checkout URL is normalized to the secure key identifier", () => {
  assert.equal(
    checkoutIdentifierFromValue("https://hotelapp.charlydob.com/checkout/ck_securetoken"),
    "ck_securetoken",
  );
  assert.equal(checkoutIdentifierFromValue("ck_securetoken"), "ck_securetoken");
});

test("valid QR can be resolved without registering checkout", async () => {
  const database = createFakeDatabase({
    tenants: {
      hotelA: { id: "hotelA", name: "Hotel A", slug: "hotel-a", active: true },
    },
    tenantModules: {
      hotelA: { checkout: { moduleId: "checkout", enabled: true } },
    },
  });
  const room = await createRoom(database, "hotelA", { number: "109" });
  const key = await createKeyIdentifier(database, "hotelA", { roomId: room.id });

  const target = await resolveCheckoutByIdentifier(database, key.identifier, "qr");

  assert.equal(target.room.number, "109");
  assert.equal(target.tenant.slug, "hotel-a");
  assert.equal(Object.values(database.data.checkoutEvents).length, 0);
});

test("invalid QR is rejected", async () => {
  const database = createFakeDatabase();

  await assert.rejects(
    () => resolveCheckoutByIdentifier(database, "not-a-real-key", "qr"),
    (error) => {
      assert.equal(error.statusCode, 404);
      assert.equal(error.code, "QR_INVALID");
      return true;
    },
  );
});

test("deactivated QR is rejected distinctly", async () => {
  const database = createFakeDatabase({
    tenants: {
      hotelA: { id: "hotelA", name: "Hotel A", slug: "hotel-a", active: true },
    },
    tenantModules: {
      hotelA: { checkout: { moduleId: "checkout", enabled: true } },
    },
  });
  const room = await createRoom(database, "hotelA", { number: "109" });
  const key = await createKeyIdentifier(database, "hotelA", { roomId: room.id });
  await updateKeyIdentifier(database, "hotelA", key.id, { active: false });

  await assert.rejects(
    () => resolveCheckoutByIdentifier(database, key.identifier, "qr"),
    (error) => {
      assert.equal(error.statusCode, 410);
      assert.equal(error.code, "QR_DEACTIVATED");
      return true;
    },
  );
});
