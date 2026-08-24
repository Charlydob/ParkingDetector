import test from "node:test";
import assert from "node:assert/strict";
import { ensureDemoTenant, getAuthSession } from "./tenantService.js";

function createFakeDatabase(initial = {}) {
  const data = {
    tenants: {},
    users: {},
    memberships: {},
    tenantModules: {},
    tenantSettings: {},
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
    async listRecords(collection) {
      return Object.values(data[collection] || {});
    },
    async getMembershipsForUser(userId) {
      return Object.values(data.memberships || {}).filter(
        (membership) => membership.userId === userId,
      );
    },
    async getTenantModules(tenantId) {
      return Object.fromEntries(
        Object.values(data.tenantModules?.[tenantId] || {}).map((module) => [
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

test("Demo Hotel is created as a separate tenant with implemented modules", async () => {
  const database = createFakeDatabase();

  const tenant = await ensureDemoTenant(database);

  assert.equal(tenant.name, "Demo Hotel");
  assert.equal(tenant.slug, "demo-hotel");
  assert.equal(Object.values(database.data.memberships).length, 0);
  assert.equal(database.data.tenantModules[tenant.id].parking.enabled, true);
  assert.equal(database.data.tenantModules[tenant.id].checkout.enabled, true);
  assert.equal(database.data.tenantSettings[tenant.id].frigate.baseUrl, "http://frigate:5000");
});

test("authenticated platform_admin with no tenant can create a safe session", async () => {
  const database = createFakeDatabase({
    users: {
      "admin-user": {
        id: "admin-user",
        email: "owner@example.com",
        displayName: "Owner",
        globalRole: "platform_admin",
      },
    },
  });

  const session = await getAuthSession(database, {
    id: "admin-user",
      email: "owner@example.com",
    });

  assert.equal(session.isPlatformAdmin, true);
  assert.deepEqual(session.memberships, []);
  assert.deepEqual(session.tenants, []);
  assert.deepEqual(session.modulesByTenant, {});
  assert.deepEqual(session.modules.map((module) => module.enabled), session.modules.map(() => false));
  assert.equal(session.activeTenantId, "");
});

test("authenticated tenant user with membership receives tenant and module session", async () => {
  const database = createFakeDatabase({
    users: {
      userA: {
        id: "userA",
        email: "staff@example.com",
        displayName: "Staff",
      },
    },
    tenants: {
      hotelA: {
        id: "hotelA",
        name: "Hotel A",
        slug: "hotel-a",
        active: true,
        createdAt: "2026-01-01T00:00:00.000Z",
      },
    },
    memberships: {
      "hotelA:userA": {
        id: "hotelA:userA",
        tenantId: "hotelA",
        userId: "userA",
        role: "staff",
      },
    },
    tenantModules: {
      hotelA: {
        parking: { moduleId: "parking", enabled: true },
        checkout: { moduleId: "checkout", enabled: false },
      },
    },
  });

  const session = await getAuthSession(database, {
    id: "userA",
    email: "staff@example.com",
  });

  assert.equal(session.isPlatformAdmin, false);
  assert.equal(session.activeTenantId, "hotelA");
  assert.equal(session.memberships.length, 1);
  assert.equal(session.tenants.length, 1);
  assert.equal(session.modulesByTenant.hotelA.parking, true);
  assert.equal(session.modules.find((module) => module.id === "parking")?.enabled, true);
  assert.equal(session.modules.find((module) => module.id === "checkout")?.enabled, false);
});

test("platform_admin does not auto-select a tenant when tenants exist", async () => {
  const database = createFakeDatabase({
    users: {
      "admin-user": {
        id: "admin-user",
        email: "owner@example.com",
        displayName: "Owner",
        globalRole: "platform_admin",
      },
    },
    tenants: {
      hotelA: {
        id: "hotelA",
        name: "Hotel A",
        slug: "hotel-a",
        active: true,
        createdAt: "2026-01-01T00:00:00.000Z",
      },
    },
    tenantModules: {
      hotelA: {
        parking: { moduleId: "parking", enabled: true },
      },
    },
  });

  const session = await getAuthSession(database, {
    id: "admin-user",
    email: "owner@example.com",
  });

  assert.equal(session.isPlatformAdmin, true);
  assert.equal(session.activeTenantId, "");
  assert.equal(session.tenants.length, 1);
  assert.equal(session.modules.find((module) => module.id === "parking")?.enabled, false);
});

test("platform_admin can preview a selected tenant without membership", async () => {
  const database = createFakeDatabase({
    users: {
      "admin-user": {
        id: "admin-user",
        email: "owner@example.com",
        displayName: "Owner",
        globalRole: "platform_admin",
      },
    },
    tenants: {
      hotelA: {
        id: "hotelA",
        name: "Hotel A",
        slug: "hotel-a",
        active: true,
        createdAt: "2026-01-01T00:00:00.000Z",
      },
    },
    tenantModules: {
      hotelA: {
        checkout: { moduleId: "checkout", enabled: true },
      },
    },
  });

  const session = await getAuthSession(
    database,
    {
      id: "admin-user",
      email: "owner@example.com",
    },
    "hotelA",
  );

  assert.equal(session.activeTenantId, "hotelA");
  assert.deepEqual(session.memberships, []);
  assert.equal(session.modules.find((module) => module.id === "checkout")?.enabled, true);
});

test("authenticated non-admin user with no membership receives safe empty session", async () => {
  const database = createFakeDatabase({
    users: {
      "lonely-user": {
        id: "lonely-user",
        email: "lonely@example.com",
        displayName: "Lonely",
      },
    },
  });

  const session = await getAuthSession(database, {
    id: "lonely-user",
      email: "lonely@example.com",
    });

  assert.equal(session.isPlatformAdmin, false);
  assert.deepEqual(session.memberships, []);
  assert.deepEqual(session.tenants, []);
  assert.deepEqual(session.modulesByTenant, {});
  assert.equal(session.activeTenantId, "");
  assert.ok(Array.isArray(session.modules));
});
