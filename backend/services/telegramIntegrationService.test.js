import test from "node:test";
import assert from "node:assert/strict";
import {
  connectTelegramChat,
  createTelegramPairingCode,
  disconnectTelegramChat,
  validateTelegramIntegrationSecret,
} from "./telegramIntegrationService.js";

function createFakeDatabase(initial = {}) {
  const data = {
    tenants: {},
    tenantSettings: {},
    diagnostics: {},
    ...initial,
  };

  return {
    data,
    async getRecord(collection, id) {
      return data[collection]?.[id];
    },
    async setRecord(collection, id, value) {
      data[collection] ||= {};
      data[collection][id] = { ...value, id };
      return data[collection][id];
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
  });
});
