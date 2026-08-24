import test from "node:test";
import assert from "node:assert/strict";
import { handleVersionRoute } from "./versionRoutes.js";

test("GET /api/version returns deployed commit and environment", () => {
  const result = handleVersionRoute({
    request: { method: "GET" },
    pathname: "/api/version",
    env: {
      GIT_SHA: "abcdef1234567890",
      NODE_ENV: "production",
    },
  });

  assert.equal(result.status, 200);
  assert.deepEqual(result.payload, {
    version: "abcdef123456",
    environment: "production",
  });
});

test("GET /api/version falls back safely when no SHA is configured", () => {
  const result = handleVersionRoute({
    request: { method: "GET" },
    pathname: "/api/version",
    env: {},
  });

  assert.equal(result.status, 200);
  assert.deepEqual(result.payload, {
    version: "unknown",
    environment: "development",
  });
});
