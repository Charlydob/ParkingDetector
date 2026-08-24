import { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";

const prisma = new PrismaClient();

const MODEL_BY_COLLECTION = {
  users: "user",
  sessions: "session",
  tenants: "tenant",
  memberships: "membership",
  tenantSettings: "tenantSettings",
  rooms: "room",
  keyIdentifiers: "keyIdentifier",
  checkoutEvents: "checkoutEvent",
  invitations: "invitation",
  userInvitations: "invitation",
  detections: "detection",
  checkIns: "checkIn",
  plateStates: "plateState",
  diagnostics: "diagnostic",
};

const TENANT_SCOPED = new Set([
  "rooms",
  "keyIdentifiers",
  "checkoutEvents",
  "detections",
  "checkIns",
  "invitations",
  "userInvitations",
]);

const DATE_FIELDS = new Set([
  "createdAt",
  "updatedAt",
  "expiresAt",
  "usedAt",
  "revokedAt",
  "lastSeenAt",
  "detectedAt",
  "checkInAt",
  "timestamp",
  "firstSeenAt",
  "seenAgainAt",
  "releasedAt",
  "lastCheckoutAt",
]);

const JSON_FIELDS = new Set([
  "basicInfo",
  "reservations",
  "frigate",
  "cameras",
  "stripe",
  "telegram",
  "notifications",
  "checkout",
  "integrations",
  "metadata",
  "associationCandidates",
  "value",
]);

function modelName(collection) {
  const model = MODEL_BY_COLLECTION[collection];

  if (!model) {
    throw new Error(`Unknown database collection '${collection}'.`);
  }

  return model;
}

function removeUndefinedValues(value) {
  if (Array.isArray(value)) {
    return value.map(removeUndefinedValues);
  }

  if (value && typeof value === "object" && !(value instanceof Date)) {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, fieldValue]) => fieldValue !== undefined)
        .map(([key, fieldValue]) => [key, removeUndefinedValues(fieldValue)]),
    );
  }

  return value;
}

function normalizeForWrite(value = {}) {
  const next = removeUndefinedValues(value);

  for (const key of DATE_FIELDS) {
    if (typeof next[key] === "string" && next[key]) {
      next[key] = new Date(next[key]);
    }
  }

  for (const key of JSON_FIELDS) {
    if (next[key] === undefined) {
      continue;
    }

    if (next[key] === null) {
      next[key] = key === "associationCandidates" ? null : {};
    }
  }

  return next;
}

function normalizeForRead(value) {
  if (!value) {
    return undefined;
  }

  if (Array.isArray(value)) {
    return value.map(normalizeForRead);
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, fieldValue]) => [key, normalizeForRead(fieldValue)]),
    );
  }

  return value;
}

function normalizeId(collection, id, value = {}) {
  if (collection === "tenantSettings") {
    return { ...value, tenantId: id };
  }

  if (collection === "plateStates") {
    return { ...value, plate: id };
  }

  if (collection === "diagnostics") {
    return { key: id, value };
  }

  return { ...value, id };
}

function buildWhere(collection, id) {
  if (collection === "tenantSettings") {
    return { tenantId: id };
  }

  if (collection === "plateStates") {
    return { plate: id };
  }

  if (collection === "diagnostics") {
    return { key: id };
  }

  return { id };
}

function createData(collection, id, value) {
  if (collection === "tenantSettings") {
    return normalizeForWrite({ ...value, tenantId: id });
  }

  if (collection === "plateStates") {
    return normalizeForWrite({ ...value, plate: id });
  }

  if (collection === "diagnostics") {
    return normalizeForWrite({ key: id, value });
  }

  return normalizeForWrite({ ...value, id });
}

function updateData(collection, value) {
  if (collection === "diagnostics") {
    return normalizeForWrite({ value });
  }

  const next = normalizeForWrite(value);
  delete next.id;
  delete next.tenantId;
  delete next.plate;
  delete next.key;
  return next;
}

function createRecordData(collection, value) {
  const id = value.id || randomUUID();
  return createData(collection, id, { ...value, id });
}

function orderByFor(collection) {
  if (collection === "detections") {
    return { detectedAt: "desc" };
  }

  if (collection === "checkoutEvents") {
    return { timestamp: "desc" };
  }

  if (collection === "invitations" || collection === "userInvitations") {
    return { createdAt: "desc" };
  }

  return undefined;
}

export function createDatabaseClient() {
  return {
    prisma,

    async disconnect() {
      await prisma.$disconnect();
    },

    async setRecord(collection, id, value) {
      const model = modelName(collection);
      const data = createData(collection, id, value);
      const result = await prisma[model].upsert({
        where: buildWhere(collection, id),
        create: data,
        update: updateData(collection, value),
      });
      return normalizeForRead(result);
    },

    async createRecord(collection, value) {
      const model = modelName(collection);
      const result = await prisma[model].create({
        data: createRecordData(collection, value),
      });
      return normalizeForRead(result);
    },

    async getRecord(collection, id) {
      const model = modelName(collection);
      const result = await prisma[model].findUnique({
        where: buildWhere(collection, id),
      });
      return normalizeForRead(result);
    },

    async updateRecord(collection, id, patch) {
      const model = modelName(collection);
      const result = await prisma[model].update({
        where: buildWhere(collection, id),
        data: updateData(collection, patch),
      });
      return normalizeForRead(result);
    },

    async deleteRecord(collection, id) {
      const model = modelName(collection);
      await prisma[model].delete({ where: buildWhere(collection, id) });
    },

    async listRecords(collection) {
      const model = modelName(collection);
      const result = await prisma[model].findMany({
        ...(orderByFor(collection) ? { orderBy: orderByFor(collection) } : {}),
      });
      return normalizeForRead(result);
    },

    async listTenantRecords(collection, tenantId) {
      if (!TENANT_SCOPED.has(collection)) {
        return [];
      }

      const model = modelName(collection);
      const result = await prisma[model].findMany({
        where: { tenantId },
        ...(orderByFor(collection) ? { orderBy: orderByFor(collection) } : {}),
      });
      return normalizeForRead(result);
    },

    async getTenantRecord(collection, tenantId, id) {
      const record = await this.getRecord(collection, id);
      return record?.tenantId === tenantId ? record : undefined;
    },

    async getMembershipsForUser(userId) {
      return normalizeForRead(await prisma.membership.findMany({ where: { userId } }));
    },

    async getTenantModules(tenantId) {
      const modules = await prisma.tenantModule.findMany({ where: { tenantId } });
      return Object.fromEntries(modules.map((module) => [module.moduleId, Boolean(module.enabled)]));
    },

    async setTenantModule(tenantId, moduleId, enabled) {
      const result = await prisma.tenantModule.upsert({
        where: { tenantId_moduleId: { tenantId, moduleId } },
        create: { tenantId, moduleId, enabled: Boolean(enabled) },
        update: { enabled: Boolean(enabled) },
      });
      return normalizeForRead(result);
    },

    async createDetection(detection) {
      return this.createRecord("detections", detection);
    },

    async getDetections() {
      return this.listRecords("detections");
    },

    async getDetection(detectionId) {
      return this.getRecord("detections", detectionId);
    },

    async updateDetection(detectionId, patch) {
      return this.updateRecord("detections", detectionId, patch);
    },

    async deleteDetection(detectionId) {
      return this.deleteRecord("detections", detectionId);
    },

    async getPlateState(plate) {
      return this.getRecord("plateStates", plate);
    },

    async getPlateStates() {
      return this.listRecords("plateStates");
    },

    async updatePlateState(plate, patch) {
      return this.setRecord("plateStates", plate, { ...patch, plate });
    },

    async releasePlateAssignment(plate) {
      return this.updatePlateState(plate, {
        currentlyPresent: false,
        activeReservationCode: null,
        activeRoom: null,
        activeGuestName: null,
        associationStatus: null,
        associationMethod: null,
        confidence: null,
        releasedAt: new Date().toISOString(),
      });
    },

    async getPlateStateDiagnostics() {
      const plateStates = await this.getPlateStates();
      const activePlates = plateStates.filter((plateState) => plateState.activeReservationCode);
      const presentPlates = plateStates.filter((plateState) => plateState.currentlyPresent);

      return {
        activePlates: plateStates.length,
        presentPlates: presentPlates.length,
        assignedPlates: activePlates.length,
      };
    },

    async createCheckIn(checkIn) {
      return this.createRecord("checkIns", checkIn);
    },

    async getCheckIns() {
      return this.listRecords("checkIns");
    },

    async updateStripeDiagnostic(diagnostic) {
      const current = await this.getRecord("diagnostics", "stripe");
      return this.setRecord("diagnostics", "stripe", {
        ...(current?.value || {}),
        ...diagnostic,
      });
    },

    async testConnection() {
      await prisma.$queryRaw`SELECT 1`;
      return true;
    },
  };
}
