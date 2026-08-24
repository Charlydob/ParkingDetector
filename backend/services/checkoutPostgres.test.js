import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createRateLimiter } from "../rateLimiter.js";
import { handlePublicCheckoutRoute } from "../routes/checkoutRoutes.js";
import {
  archiveRoom,
  createKeyIdentifier,
  createRoom,
  deleteKeyIdentifier,
  updateRoom,
} from "./checkoutService.js";

const postgresTestDatabaseUrl =
  process.env.CHECKOUT_POSTGRES_TEST_DATABASE_URL ||
  (process.env.NODE_ENV === "test" ? process.env.DATABASE_URL : "");

function publicRequest(method) {
  return {
    method,
    headers: { host: "checkout.test" },
    socket: { remoteAddress: `test-${randomUUID()}` },
  };
}

async function publicCheckout(database, method, identifier, body = {}) {
  return handlePublicCheckoutRoute({
    request: publicRequest(method),
    pathname: `/api/public/checkout/${encodeURIComponent(identifier)}`,
    body,
    context: {
      database,
      publicCheckoutLimiter: createRateLimiter({ windowMs: 60_000, max: 100 }),
    },
  });
}

test(
  "PostgreSQL advisory lock keeps public QR checkout idempotent without Prisma void errors",
  { skip: postgresTestDatabaseUrl ? false : "Set CHECKOUT_POSTGRES_TEST_DATABASE_URL for PostgreSQL coverage." },
  async () => {
    process.env.DATABASE_URL = postgresTestDatabaseUrl;
    const { createDatabaseClient } = await import("../databaseClient.js");
    const database = createDatabaseClient();
    const tenantId = randomUUID();

    try {
      await database.setRecord("tenants", tenantId, {
        id: tenantId,
        name: "Postgres Checkout Test",
        slug: `pg-checkout-${randomUUID()}`,
        active: true,
      });
      await database.setTenantModule(tenantId, "checkout", true);

      const room = await createRoom(database, tenantId, { number: "201", status: "occupied" });
      const key = await createKeyIdentifier(database, tenantId, {
        roomId: room.id,
        label: "Checkout",
      });

      const resolved = await publicCheckout(database, "GET", key.identifier);
      assert.equal(resolved.status, 200);
      assert.equal(resolved.payload.room.number, "201");

      const first = await publicCheckout(database, "POST", key.identifier, {
        attemptToken: resolved.payload.attemptToken,
      });
      assert.equal(first.status, 200);
      assert.equal(first.payload.duplicate, false);

      const duplicate = await publicCheckout(database, "POST", key.identifier, {
        attemptToken: resolved.payload.attemptToken,
      });
      assert.equal(duplicate.status, 200);
      assert.equal(duplicate.payload.duplicate, true);
      assert.equal((await database.listTenantRecords("checkoutEvents", tenantId)).length, 1);

      await updateRoom(database, tenantId, room.id, { status: "cleaning" });
      await updateRoom(database, tenantId, room.id, { status: "ready" });
      const nextResolved = await publicCheckout(database, "GET", key.identifier);
      const simultaneous = await Promise.all([
        publicCheckout(database, "POST", key.identifier, {
          attemptToken: nextResolved.payload.attemptToken,
        }),
        publicCheckout(database, "POST", key.identifier, {
          attemptToken: nextResolved.payload.attemptToken,
        }),
      ]);

      assert.equal(simultaneous.filter((result) => result.payload.duplicate === false).length, 1);
      assert.equal(simultaneous.filter((result) => result.payload.duplicate === true).length, 1);
      assert.equal((await database.listTenantRecords("checkoutEvents", tenantId)).length, 2);

      await deleteKeyIdentifier(database, tenantId, key.id);
      await assert.rejects(
        () => publicCheckout(database, "GET", key.identifier),
        (error) => {
          assert.equal(error.statusCode, 404);
          assert.equal(error.code, "QR_INVALID");
          return true;
        },
      );

      const archivedRoom = await createRoom(database, tenantId, { number: "202", status: "occupied" });
      const archivedKey = await createKeyIdentifier(database, tenantId, { roomId: archivedRoom.id });
      await archiveRoom(database, tenantId, archivedRoom.id);
      await assert.rejects(
        () => publicCheckout(database, "GET", archivedKey.identifier),
        (error) => {
          assert.equal(error.statusCode, 410);
          assert.equal(error.code, "QR_DEACTIVATED");
          return true;
        },
      );
    } finally {
      await database.deleteRecord("tenants", tenantId).catch(() => undefined);
      await database.disconnect();
    }
  },
);
