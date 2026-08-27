import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_DASHBOARD_WIDGETS,
  getTenantDashboardSettings,
  getPublicTenantSettings,
  getTenantSettings,
  updateTenantDashboardSettings,
  updateTenantSettings,
} from "./tenantSettingsService.js";
import { createTenant } from "./tenantService.js";

function createFakeDatabase(initial = {}) {
  const data = {
    tenants: {},
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
    async setTenantModule(tenantId, moduleId, enabled) {
      data.tenantModules[tenantId] ||= {};
      data.tenantModules[tenantId][moduleId] = { tenantId, moduleId, enabled };
      return data.tenantModules[tenantId][moduleId];
    },
  };
}

test("new tenant creates blank tenantSettings and does not inherit default-hotel integrations", async () => {
  const database = createFakeDatabase({
    tenantSettings: {
      "default-hotel": {
        tenantId: "default-hotel",
        reservations: {
          enabled: true,
          source: "googleSheets",
          googleSheets: { csvUrl: "https://example.com/default.csv" },
        },
        frigate: { enabled: true, baseUrl: "http://frigate-default:5000" },
        stripe: {
          enabled: true,
          secretKey: "sk_default",
          webhookSecret: "whsec_default",
        },
        notifications: {
          telegram: { enabled: true, botToken: "token", chatId: "default-chat" },
        },
      },
    },
  });

  const tenant = await createTenant(database, {
    name: "Hotel X",
    slug: "hotel-x",
    modules: { parking: true },
  });
  const settings = await getTenantSettings(database, tenant.id);

  assert.equal(settings.tenantId, tenant.id);
  assert.equal(tenant.slug, "hotel-x");
  assert.equal(settings.reservations.enabled, false);
  assert.equal(settings.reservations.source, null);
  assert.equal(settings.reservations.googleSheets.csvUrl, "");
  assert.equal(settings.frigate.enabled, false);
  assert.equal(settings.frigate.baseUrl, "");
  assert.equal(settings.stripe.enabled, false);
  assert.equal(settings.stripe.secretKey, "");
  assert.equal(settings.notifications.telegram.enabled, false);
});

test("tenant integration settings are isolated between tenants", async () => {
  const database = createFakeDatabase();
  await updateTenantSettings(database, "hotel-a", {
    reservations: {
      enabled: true,
      source: "json",
      jsonFeed: { url: "https://api.example.com/a", jsonPath: "reservations" },
    },
    frigate: { enabled: true, baseUrl: "http://frigate-a:5000" },
  });
  await updateTenantSettings(database, "hotel-b", {
    reservations: {
      enabled: true,
      source: "googleSheets",
      googleSheets: { csvUrl: "https://example.com/b.csv" },
    },
    frigate: { enabled: true, baseUrl: "http://frigate-b:5000" },
  });

  const tenantA = await getPublicTenantSettings(database, "hotel-a");
  const tenantB = await getPublicTenantSettings(database, "hotel-b");

  assert.equal(tenantA.reservations.jsonFeed.url, "https://api.example.com/a");
  assert.equal(tenantA.reservations.googleSheets.csvUrl, "");
  assert.equal(tenantA.frigate.baseUrl, "http://frigate-a:5000");
  assert.equal(tenantB.reservations.googleSheets.csvUrl, "https://example.com/b.csv");
  assert.equal(tenantB.reservations.jsonFeed.url, "");
  assert.equal(tenantB.frigate.baseUrl, "http://frigate-b:5000");
});

test("legacy Telegram bot tokens are not exposed or persisted on settings update", async () => {
  const database = createFakeDatabase({
    tenantSettings: {
      "hotel-a": {
        tenantId: "hotel-a",
        notifications: {
          telegram: { enabled: true, botToken: "legacy-token", chatId: "chat-a" },
        },
      },
    },
  });

  const settings = await getTenantSettings(database, "hotel-a");
  const publicSettings = await getPublicTenantSettings(database, "hotel-a");

  assert.equal(settings.notifications.telegram.enabled, true);
  assert.equal(settings.notifications.telegram.chatId, "chat-a");
  assert.equal(settings.notifications.telegram.botToken, undefined);
  assert.equal(publicSettings.notifications.telegram.chatId, "chat-a");
  assert.equal(publicSettings.notifications.telegram.botTokenConfigured, undefined);

  await updateTenantSettings(database, "hotel-a", {
    notifications: { telegram: { enabled: true, chatId: "chat-b" } },
  });

  assert.equal(database.data.tenantSettings["hotel-a"].notifications.telegram.chatId, "chat-b");
  assert.equal(database.data.tenantSettings["hotel-a"].notifications.telegram.botToken, undefined);
});

test("dashboard widget visibility is tenant-scoped settings only", async () => {
  const database = createFakeDatabase();

  const defaults = await getTenantDashboardSettings(database, "hotel-a");
  assert.equal(defaults.widgets.staff.housekeeping, DEFAULT_DASHBOARD_WIDGETS.staff.housekeeping);
  assert.equal(defaults.widgets.staff.parking, false);

  const updated = await updateTenantDashboardSettings(database, "hotel-a", {
    widgets: {
      staff: { parking: true, reservations: true },
    },
  });
  const otherTenant = await getTenantDashboardSettings(database, "hotel-b");

  assert.equal(updated.widgets.staff.parking, true);
  assert.equal(updated.widgets.staff.reservations, true);
  assert.equal(otherTenant.widgets.staff.parking, false);
  assert.equal(database.data.tenantModules["hotel-a"], undefined);
});
