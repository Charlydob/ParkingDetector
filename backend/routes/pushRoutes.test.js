import test from "node:test";
import assert from "node:assert/strict";
import webpush from "web-push";
import { handlePushRoute } from "./pushRoutes.js";
import { setWebPushTestHooks, subscribeUserPush } from "../services/webPushService.js";

function createFakeDatabase(initial = {}) {
  const data = {
    webPushConfigs: {},
    pushSubscriptions: {},
    pushPreferences: {},
    scheduledPushes: {},
    tenants: {},
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
  };
}

function browserSubscription(endpoint) {
  return {
    endpoint,
    keys: {
      p256dh: `p256dh-${endpoint}`,
      auth: `auth-${endpoint}`,
    },
  };
}

test("POST /api/push/test exposes Apple BadJwtToken provider reason", async () => {
  const database = createFakeDatabase({
    tenants: {
      "hotel-a": { id: "hotel-a", slug: "hotel-a", name: "Hotel A", active: true },
    },
  });
  const reset = setWebPushTestHooks({
    generateVapidKeys: () => webpush.generateVAPIDKeys(),
    sendNotification: async () => {
      const error = new Error("Apple Web Push rejected the JWT.");
      error.statusCode = 403;
      error.body = '{"reason":"BadJwtToken"}';
      throw error;
    },
  });

  try {
    await subscribeUserPush(database, {
      userId: "user-a",
      tenantId: "hotel-a",
      subscription: browserSubscription("endpoint-a"),
    });

    const result = await handlePushRoute({
      request: { method: "POST", headers: {} },
      pathname: "/api/push/test",
      body: { endpoint: "endpoint-a" },
      context: {
        database,
        session: {
          user: { id: "user-a" },
          activeTenantId: "hotel-a",
          memberships: [],
          isPlatformAdmin: false,
        },
      },
    });

    assert.equal(result.status, 403);
    assert.equal(result.payload.success, false);
    assert.equal(result.payload.httpStatus, 403);
    assert.equal(result.payload.providerReason, "BadJwtToken");
    assert.match(result.payload.error, /BadJwtToken/);
    assert.equal(result.payload.diagnostics.body, '{"reason":"BadJwtToken"}');
  } finally {
    reset();
  }
});

test("GET /api/push/test-schedule/:id returns the scheduled test status", async () => {
  const database = createFakeDatabase({
    scheduledPushes: {
      "scheduled-a": {
        id: "scheduled-a",
        userId: "user-a",
        tenantId: "hotel-a",
        status: "failed",
        sendAt: "2026-08-27T10:00:00.000Z",
        sentAt: null,
        error: "Apple Web Push rejected the JWT.",
        httpStatus: 403,
        providerReason: "BadJwtToken",
      },
    },
  });

  const result = await handlePushRoute({
    request: { method: "GET", headers: {} },
    pathname: "/api/push/test-schedule/scheduled-a",
    body: {},
    context: {
      database,
      session: {
        user: { id: "user-a" },
        activeTenantId: "hotel-a",
        memberships: [],
        isPlatformAdmin: false,
      },
    },
  });

  assert.equal(result.status, 200);
  assert.deepEqual(result.payload, {
    id: "scheduled-a",
    status: "failed",
    sendAt: "2026-08-27T10:00:00.000Z",
    sentAt: null,
    error: "Apple Web Push rejected the JWT.",
    providerReason: "BadJwtToken",
    httpStatus: 403,
  });
});
