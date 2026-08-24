import test from "node:test";
import assert from "node:assert/strict";
import {
  createKeyIdentifier,
  createRoom,
  listCheckoutOverview,
  registerCheckoutByIdentifier,
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
