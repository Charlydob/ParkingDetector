import test from "node:test";
import assert from "node:assert/strict";
import {
  displayNameForMembership,
  updateOwnUserProfile,
  updateTenantMembershipAlias,
} from "./userDisplayService.js";
import { requireTenantManager } from "./tenantService.js";

function createFakeDatabase(initial = {}) {
  const data = {
    users: {},
    memberships: {},
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
  };
}

function session(userId, role = "staff") {
  return {
    user: { id: userId },
    activeTenantId: "hotel-a",
    isPlatformAdmin: role === "platform_admin",
    memberships: role === "platform_admin" ? [] : [
      { id: `${userId}-member`, tenantId: "hotel-a", userId, role },
    ],
  };
}

test("username is globally unique case-insensitively when present", async () => {
  const database = createFakeDatabase({
    users: {
      userA: { id: "userA", email: "a@example.test", displayName: "A", username: "Charly", usernameNormalized: "charly", active: true },
      userB: { id: "userB", email: "b@example.test", displayName: "B", active: true },
    },
  });

  await assert.rejects(
    () => updateOwnUserProfile(database, session("userB"), { username: "charly" }),
    (error) => error.statusCode === 409,
  );

  const updated = await updateOwnUserProfile(database, session("userB"), { username: "PedroM" });
  assert.equal(updated.username, "PedroM");
  assert.equal(database.data.users.userB.usernameNormalized, "pedrom");
});

test("display name priority is alias, username, useful displayName, email", () => {
  const user = { id: "userA", email: "a@example.test", username: "Marmota26", displayName: "Account Name" };

  assert.equal(displayNameForMembership(user, { alias: "Pedro" }), "Pedro");
  assert.equal(displayNameForMembership(user, {}), "Marmota26");
  assert.equal(displayNameForMembership({ ...user, username: "" }, {}), "Account Name");
  assert.equal(displayNameForMembership({ ...user, username: "", displayName: "a@example.test" }, {}), "a@example.test");
});

test("alias is tenant-scoped and manager can edit it", async () => {
  const database = createFakeDatabase({
    memberships: {
      a: { id: "a", tenantId: "hotel-a", userId: "staff", role: "staff" },
      b: { id: "b", tenantId: "hotel-b", userId: "staff", role: "staff" },
    },
  });

  await updateTenantMembershipAlias(
    database,
    session("manager", "manager"),
    "hotel-a",
    "a",
    { alias: "Charly" },
    requireTenantManager,
  );

  assert.equal(database.data.memberships.a.alias, "Charly");
  assert.equal(database.data.memberships.b.alias, undefined);
});

test("staff cannot edit another member alias", async () => {
  const database = createFakeDatabase({
    memberships: {
      a: { id: "a", tenantId: "hotel-a", userId: "other", role: "staff" },
    },
  });

  await assert.rejects(
    () =>
      updateTenantMembershipAlias(
        database,
        session("staff", "staff"),
        "hotel-a",
        "a",
        { alias: "Nope" },
        requireTenantManager,
      ),
    (error) => error.statusCode === 403,
  );
});
