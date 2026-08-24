import test from "node:test";
import assert from "node:assert/strict";
import {
  authenticateSessionRequest,
  destroyRequestSession,
  hashPassword,
  loginWithPassword,
  sessionCookieHeader,
} from "./sessionService.js";

function createFakeDatabase(initial = {}) {
  const data = {
    users: {},
    sessions: {},
    tenants: {},
    memberships: {},
    tenantModules: {},
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
    async updateRecord(collection, id, patch) {
      data[collection][id] = { ...data[collection][id], ...patch };
      return data[collection][id];
    },
    async deleteRecord(collection, id) {
      delete data[collection]?.[id];
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
  };
}

function requestWithCookie(cookie) {
  return {
    headers: {
      cookie,
    },
  };
}

test("valid login creates a persisted session", async () => {
  const database = createFakeDatabase({
    users: {
      userA: {
        id: "userA",
        email: "user@example.com",
        displayName: "User",
        active: true,
        passwordHash: await hashPassword("password123"),
      },
    },
  });

  const { user, session } = await loginWithPassword(database, {
    email: "USER@example.com",
    password: "password123",
  });

  assert.equal(user.id, "userA");
  assert.ok(database.data.sessions[session.id]);
});

test("invalid login is rejected", async () => {
  const database = createFakeDatabase({
    users: {
      userA: {
        id: "userA",
        email: "user@example.com",
        displayName: "User",
        active: true,
        passwordHash: await hashPassword("password123"),
      },
    },
  });

  await assert.rejects(
    () => loginWithPassword(database, { email: "user@example.com", password: "wrongpass" }),
    (error) => error.statusCode === 401,
  );
});

test("logout removes current session", async () => {
  const database = createFakeDatabase({
    users: {
      userA: {
        id: "userA",
        email: "user@example.com",
        displayName: "User",
        active: true,
        passwordHash: await hashPassword("password123"),
      },
    },
  });
  const { session } = await loginWithPassword(database, {
    email: "user@example.com",
    password: "password123",
  });

  await destroyRequestSession(database, requestWithCookie(sessionCookieHeader(session.id, session.expiresAt)));

  assert.equal(database.data.sessions[session.id], undefined);
});

test("expired session is rejected and cleaned up", async () => {
  const database = createFakeDatabase({
    users: {
      userA: {
        id: "userA",
        email: "user@example.com",
        displayName: "User",
        active: true,
        passwordHash: "unused",
      },
    },
    sessions: {
      expired: {
        id: "expired",
        userId: "userA",
        expiresAt: "2000-01-01T00:00:00.000Z",
      },
    },
  });

  await assert.rejects(
    () =>
      authenticateSessionRequest(
        database,
        requestWithCookie(sessionCookieHeader("expired", new Date("2000-01-01T00:00:00.000Z"))),
      ),
    (error) => error.statusCode === 401,
  );

  assert.equal(database.data.sessions.expired, undefined);
});
