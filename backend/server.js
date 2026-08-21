import { createServer } from "node:http";
import { createReadStream, readFileSync } from "node:fs";
import { stat } from "node:fs/promises";
import path from "node:path";
import Stripe from "stripe";
import { STRIPE_FIELD_MAPPING } from "./config/stripeMapping.js";
import {
  disconnectReservationSource,
  disconnectStripeSettings,
  getFrigateSettings,
  getPublicIntegrationSettings,
  getReservationSettings,
  getStripeSettings,
  loadLocalSettings,
  updateLocalSettings,
} from "./localSettings.js";

function loadEnvFile() {
  const envPath = path.resolve(process.cwd(), ".env");

  try {
    const raw = readFileSync(envPath, "utf8");

    for (const line of raw.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) {
        continue;
      }

      const [key, ...valueParts] = trimmed.split("=");
      const value = valueParts.join("=").replace(/^['"]|['"]$/g, "");

      if (!process.env[key]) {
        process.env[key] = value;
      }
    }
  } catch (error) {
    if (error.code !== "ENOENT") {
      throw error;
    }
  }
}

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    "Content-Type": "application/json",
    ...corsHeaders(),
  });
  response.end(JSON.stringify(payload));
}

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,DELETE,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Stripe-Signature",
  };
}

async function sendEvidenceFile(response, filePath, contentType) {
  try {
    await stat(filePath);
  } catch {
    sendJson(response, 404, { error: "Evidence file not found." });
    return;
  }

  response.writeHead(200, {
    ...corsHeaders(),
    "Content-Type": contentType,
    "Cache-Control": "no-store",
  });
  createReadStream(filePath).pipe(response);
}

async function readJsonBody(request) {
  const rawBody = await readRawBody(request);

  if (rawBody.length === 0) {
    return {};
  }

  return JSON.parse(rawBody.toString("utf8"));
}

async function readRawBody(request) {
  const chunks = [];

  for await (const chunk of request) {
    chunks.push(chunk);
  }

  return Buffer.concat(chunks);
}

function getMetadataValue(metadata, fieldName) {
  const value = metadata?.[fieldName];
  return typeof value === "string" ? value.trim() : "";
}

function extractStripeCheckInInput(stripeEvent) {
  const stripeObject = stripeEvent.data.object;
  const metadata = stripeObject.metadata || {};
  const reservationCode = getMetadataValue(
    metadata,
    STRIPE_FIELD_MAPPING.reservationNumber,
  );
  const metadataFullName = getMetadataValue(metadata, STRIPE_FIELD_MAPPING.fullName);
  const metadataEmail = getMetadataValue(metadata, "email");
  const fullName =
    metadataFullName ||
    (typeof stripeObject.customer_details?.name === "string"
      ? stripeObject.customer_details.name.trim()
      : "");
  const email =
    metadataEmail ||
    (typeof stripeObject.customer_details?.email === "string"
      ? stripeObject.customer_details.email.trim()
      : "") ||
    (typeof stripeObject.receipt_email === "string" ? stripeObject.receipt_email.trim() : "");
  const paymentStatus =
    typeof stripeObject.payment_status === "string"
      ? stripeObject.payment_status
      : stripeObject.status;

  if (stripeEvent.type === "checkout.session.completed") {
    return {
      reservationCode,
      fullName,
      email,
      checkInAt: new Date(stripeEvent.created * 1000).toISOString(),
      source: "stripe",
      stripeEventId: stripeEvent.id,
      stripePaymentIntentId:
        typeof stripeObject.payment_intent === "string"
          ? stripeObject.payment_intent
          : stripeObject.payment_intent?.id,
      stripeCheckoutSessionId: stripeObject.id,
      paymentStatus,
      metadata,
    };
  }

  if (stripeEvent.type === "payment_intent.succeeded") {
    return {
      reservationCode,
      fullName,
      email,
      checkInAt: new Date(stripeEvent.created * 1000).toISOString(),
      source: "stripe",
      stripeEventId: stripeEvent.id,
      stripePaymentIntentId: stripeObject.id,
      paymentStatus,
      metadata,
    };
  }

  return undefined;
}

function cleanJsonAuthInput(nextAuth = {}, currentAuth = {}) {
  const type = ["none", "bearer", "apiKey", "basic"].includes(nextAuth.type)
    ? nextAuth.type
    : currentAuth.type || "none";

  if (type === "none") {
    return { type: "none" };
  }

  return {
    type,
    bearerToken: String(nextAuth.bearerToken ?? "").trim() || currentAuth.bearerToken || "",
    apiKeyHeader:
      String(nextAuth.apiKeyHeader ?? "").trim() || currentAuth.apiKeyHeader || "x-api-key",
    apiKeyValue: String(nextAuth.apiKeyValue ?? "").trim() || currentAuth.apiKeyValue || "",
    basicUsername:
      String(nextAuth.basicUsername ?? "").trim() || currentAuth.basicUsername || "",
    basicPassword:
      String(nextAuth.basicPassword ?? "").trim() || currentAuth.basicPassword || "",
  };
}

function getHeaderValue(headers, headerName) {
  return headers[String(headerName || "").toLowerCase()];
}

function verifyReservationWebhook(request) {
  const { reservationWebhook } = getReservationSettings();

  if (!reservationWebhook.secret) {
    return true;
  }

  return getHeaderValue(request.headers, reservationWebhook.headerName) === reservationWebhook.secret;
}

loadEnvFile();
await loadLocalSettings();

const [
  { createEventProcessor },
  {
    forceRefreshReservations,
    getReservations,
    getReservationDebug,
    getReservationDiagnostics,
    previewReservationSource,
    saveReservationWebhookPayload,
    testReservationMapping,
    testReservationConnection,
  },
  { createFileStorage },
  { createFirebaseClient },
  { createFrigateClient },
  { createPlateCooldownStore },
  { createProcessedEventsStore },
] = await Promise.all([
  import("./eventProcessor.js"),
  import("./reservationService.js"),
  import("./fileStorage.js"),
  import("./firebaseClient.js"),
  import("./frigateClient.js"),
  import("./plateCooldown.js"),
  import("./processedEvents.js"),
]);

const port = Number(process.env.BACKEND_PORT || 3001);
const status = {
  running: true,
  frigateConnected: false,
  lastPollAt: null,
  lastEventProcessed: null,
  frigateLastEvent: null,
  frigateVersion: null,
};

const firebaseClient = createFirebaseClient();
let cachedFrigateClient;
let cachedFrigateBaseUrl = "";
function getActiveFrigateClient() {
  const { baseUrl } = getFrigateSettings();

  if (!cachedFrigateClient || cachedFrigateBaseUrl !== baseUrl) {
    cachedFrigateBaseUrl = baseUrl;
    cachedFrigateClient = createFrigateClient({ baseUrl });
  }

  return cachedFrigateClient;
}
const frigateClient = {
  get baseUrl() {
    return getActiveFrigateClient().baseUrl;
  },
  testConnection() {
    return getActiveFrigateClient().testConnection();
  },
  getVersion() {
    return getActiveFrigateClient().getVersion();
  },
  getRecentCarEvents() {
    return getActiveFrigateClient().getRecentCarEvents();
  },
  getSnapshotBuffer(eventId) {
    return getActiveFrigateClient().getSnapshotBuffer(eventId);
  },
  getClipBuffer(eventId) {
    return getActiveFrigateClient().getClipBuffer(eventId);
  },
};
const fileStorage = createFileStorage();
const processedEvents = await createProcessedEventsStore();
const processedStripeEvents = await createProcessedEventsStore(
  path.resolve(process.cwd(), "backend/data/processed-stripe-events.json"),
);
const plateCooldown = await createPlateCooldownStore();
function getStripeClient(secretKey = getStripeSettings().secretKey) {
  return secretKey ? new Stripe(secretKey) : undefined;
}
await fileStorage.ensureDirectories();

const eventProcessor = createEventProcessor({
  firebaseClient,
  frigateClient,
  fileStorage,
  processedEvents,
  plateCooldown,
  onDetectionStored(detection) {
    status.lastEventProcessed = detection.detectedAt;
  },
  onCheckInStored(checkIn) {
    status.lastCheckInCreated = checkIn.createdAt;
  },
});

try {
  await forceRefreshReservations();
} catch {
  // The diagnostics endpoints expose the reservation load error.
}

let polling = false;

async function pollFrigate() {
  if (polling) {
    return;
  }

  polling = true;
  status.lastPollAt = new Date().toISOString();

  try {
    await eventProcessor.refreshExpiredPlateStates(status.lastPollAt);
    const events = await frigateClient.getRecentCarEvents();
    status.frigateConnected = true;
    status.frigateLastEvent = events[0]?.id || null;
    console.log(`[Frigate] Found ${events.length} recent events`);

    for (const event of events) {
      await eventProcessor.processFrigateEvent(event);
    }
  } catch (error) {
    status.frigateConnected = false;
    console.warn(`[Frigate] Poll failed: ${error.message}`);
  } finally {
    polling = false;
  }
}

try {
  const connection = await frigateClient.testConnection();
  status.frigateConnected = true;
  status.frigateVersion = connection?.version || (await frigateClient.getVersion());
  console.log("[Frigate] Connected");
} catch (error) {
  console.warn(`[Frigate] Not connected: ${error.message}`);
}

const server = createServer(async (request, response) => {
  if (request.method === "OPTIONS") {
    sendJson(response, 204, {});
    return;
  }

  const parsedUrl = new URL(request.url, `http://${request.headers.host || "127.0.0.1"}`);
  const pathname = parsedUrl.pathname;

  try {
    const evidenceMatch = pathname.match(/^\/api\/evidence\/(snapshots|clips)\/([^/]+)$/);
    if (request.method === "GET" && evidenceMatch) {
      const [, collection, filename] = evidenceMatch;
      const kind = collection === "clips" ? "clip" : "snapshot";
      const contentType = kind === "clip" ? "video/mp4" : "image/jpeg";
      await sendEvidenceFile(
        response,
        fileStorage.getEvidenceFilePath(kind, decodeURIComponent(filename)),
        contentType,
      );
      return;
    }

    if (request.method === "GET" && pathname === "/api/status") {
      await eventProcessor.refreshExpiredPlateStates();
      const plateStateDiagnostics = await firebaseClient.getPlateStateDiagnostics();

      sendJson(response, 200, {
        ...status,
        backendOnline: true,
        frigateBaseUrl: getFrigateSettings().baseUrl,
        frigatePollIntervalMs: getFrigateSettings().pollIntervalMs,
        processedEvents: processedEvents.count(),
        processedStripeEvents: processedStripeEvents.count(),
        plateCooldownEntries: plateCooldown.count(),
        ...plateStateDiagnostics,
        stripeConfigured: getPublicIntegrationSettings().stripe.connected,
        ...getReservationDiagnostics(),
      });
      return;
    }

    if (request.method === "GET" && pathname === "/api/settings/integrations") {
      let firebaseConnected = false;
      try {
        firebaseConnected = await firebaseClient.testConnection();
      } catch {
        firebaseConnected = false;
      }

      sendJson(response, 200, {
        ...getPublicIntegrationSettings({
          frigate: {
            connected: status.frigateConnected,
            lastPollAt: status.lastPollAt,
            lastEvent: status.frigateLastEvent,
            version: status.frigateVersion,
          },
        }),
        backend: { online: true },
        firebase: { connected: firebaseConnected },
        reservationDiagnostics: getReservationDiagnostics(),
      });
      return;
    }

    if (request.method === "POST" && pathname === "/api/settings/google-sheets/test") {
      const body = await readJsonBody(request);
      const csvUrl = String(body.csvUrl ?? "").trim();
      const result = await testReservationConnection("googleSheets", {
        googleSheetUrl: csvUrl,
        mapping: getReservationSettings().mapping,
      });
      sendJson(response, 200, result);
      return;
    }

    if (request.method === "POST" && pathname === "/api/settings/google-sheets") {
      const body = await readJsonBody(request);
      await updateLocalSettings({
        reservationSource: "googleSheets",
        googleSheets: { csvUrl: String(body.csvUrl ?? "").trim() },
      });
      await forceRefreshReservations();
      sendJson(response, 200, {
        ...getPublicIntegrationSettings(),
        reservationDiagnostics: getReservationDiagnostics(),
      });
      return;
    }

    if (request.method === "DELETE" && pathname === "/api/settings/google-sheets") {
      await disconnectReservationSource("googleSheets");
      sendJson(response, 200, getPublicIntegrationSettings());
      return;
    }

    if (request.method === "POST" && pathname === "/api/settings/json-feed/test") {
      const body = await readJsonBody(request);
      const jsonUrl = String(body.url ?? "").trim();
      const result = await testReservationConnection("json", {
        jsonUrl,
        jsonPath: String(body.jsonPath ?? "").trim(),
        auth: cleanJsonAuthInput(body.auth, getReservationSettings().jsonAuth),
        mapping: getReservationSettings().mapping,
      });
      sendJson(response, 200, result);
      return;
    }

    if (request.method === "POST" && pathname === "/api/settings/json-feed") {
      const body = await readJsonBody(request);
      const currentSettings = getReservationSettings();
      await updateLocalSettings({
        reservationSource: "json",
        jsonFeed: {
          url: String(body.url ?? "").trim(),
          jsonPath: String(body.jsonPath ?? "").trim(),
          auth: cleanJsonAuthInput(body.auth, currentSettings.jsonAuth),
        },
      });
      await forceRefreshReservations();
      sendJson(response, 200, {
        ...getPublicIntegrationSettings(),
        reservationDiagnostics: getReservationDiagnostics(),
      });
      return;
    }

    if (request.method === "DELETE" && pathname === "/api/settings/json-feed") {
      await disconnectReservationSource("json");
      sendJson(response, 200, getPublicIntegrationSettings());
      return;
    }

    if (request.method === "POST" && pathname === "/api/settings/reservation-webhook") {
      const body = await readJsonBody(request);
      const currentSettings = getReservationSettings();
      await updateLocalSettings({
        reservationSource: "reservationWebhook",
        jsonFeed: {
          jsonPath: String(body.jsonPath ?? "").trim(),
        },
        reservationWebhook: {
          headerName:
            String(body.headerName ?? "").trim() ||
            currentSettings.reservationWebhook.headerName,
          secret:
            String(body.secret ?? "").trim() ||
            currentSettings.reservationWebhook.secret,
        },
      });
      sendJson(response, 200, {
        ...getPublicIntegrationSettings(),
        reservationDiagnostics: getReservationDiagnostics(),
      });
      return;
    }

    if (request.method === "DELETE" && pathname === "/api/settings/reservation-webhook") {
      await disconnectReservationSource("reservationWebhook");
      sendJson(response, 200, getPublicIntegrationSettings());
      return;
    }

    if (request.method === "POST" && pathname === "/api/reservations/webhook") {
      if (!verifyReservationWebhook(request)) {
        sendJson(response, 401, { error: "Invalid reservation webhook secret." });
        return;
      }

      const body = await readJsonBody(request);
      const preview = await saveReservationWebhookPayload(body);

      if (getReservationSettings().source === "reservationWebhook") {
        await forceRefreshReservations();
      }

      sendJson(response, 202, {
        received: true,
        preview,
      });
      return;
    }

    if (request.method === "POST" && pathname === "/api/settings/reservation-source/preview") {
      const body = await readJsonBody(request);
      const preview = await previewReservationSource(
        body.source || getReservationSettings().source,
      );
      sendJson(response, 200, preview);
      return;
    }

    if (request.method === "POST" && pathname === "/api/settings/reservation-mapping") {
      const body = await readJsonBody(request);
      await updateLocalSettings({ reservationMapping: body.mapping ?? {} });
      await forceRefreshReservations();
      sendJson(response, 200, {
        ...getPublicIntegrationSettings(),
        reservationDiagnostics: getReservationDiagnostics(),
      });
      return;
    }

    if (request.method === "POST" && pathname === "/api/settings/reservation-mapping/test") {
      const body = await readJsonBody(request);
      sendJson(response, 200, await testReservationMapping(body.mapping ?? {}));
      return;
    }

    if (request.method === "POST" && pathname === "/api/settings/stripe/test") {
      const body = await readJsonBody(request);
      const secretKey = String(body.secretKey ?? getStripeSettings().secretKey ?? "").trim();

      if (!secretKey) {
        sendJson(response, 400, { error: "Stripe Secret Key is required." });
        return;
      }

      await getStripeClient(secretKey).balance.retrieve();
      sendJson(response, 200, { connected: true });
      return;
    }

    if (request.method === "POST" && pathname === "/api/settings/stripe") {
      const body = await readJsonBody(request);
      const currentSettings = getStripeSettings();
      await updateLocalSettings({
        stripe: {
          secretKey: String(body.secretKey ?? "").trim() || currentSettings.secretKey,
          webhookSecret:
            String(body.webhookSecret ?? "").trim() || currentSettings.webhookSecret,
        },
      });
      sendJson(response, 200, getPublicIntegrationSettings().stripe);
      return;
    }

    if (request.method === "DELETE" && pathname === "/api/settings/stripe") {
      await disconnectStripeSettings();
      sendJson(response, 200, getPublicIntegrationSettings().stripe);
      return;
    }

    if (request.method === "POST" && pathname === "/api/settings/frigate/test") {
      const body = await readJsonBody(request);
      const baseUrl = String(body.baseUrl ?? getFrigateSettings().baseUrl).trim();
      const testClient = createFrigateClient({ baseUrl });
      const connection = await testClient.testConnection();
      sendJson(response, 200, connection);
      return;
    }

    if (request.method === "POST" && pathname === "/api/settings/frigate") {
      const body = await readJsonBody(request);
      await updateLocalSettings({
        frigate: {
          baseUrl: String(body.baseUrl ?? "").trim(),
          pollIntervalMs: Number(body.pollIntervalMs || getFrigateSettings().pollIntervalMs),
        },
      });
      sendJson(response, 200, getPublicIntegrationSettings().frigate);
      return;
    }

    if (request.method === "GET" && pathname === "/api/reservations/debug") {
      try {
        await getReservations();
      } catch {
        sendJson(response, 500, {
          ...getReservationDebug(),
          ...getReservationDiagnostics(),
        });
        return;
      }

      sendJson(response, 200, getReservationDebug());
      return;
    }

    if (request.method === "POST" && pathname === "/api/reservations/refresh") {
      try {
        await forceRefreshReservations();
        sendJson(response, 200, {
          ...getReservationDebug(),
          ...getReservationDiagnostics(),
        });
      } catch {
        sendJson(response, 500, {
          ...getReservationDebug(),
          ...getReservationDiagnostics(),
        });
      }
      return;
    }

    if (request.method === "POST" && pathname === "/api/stripe/webhook") {
      const rawBody = await readRawBody(request);
      const signature = request.headers["stripe-signature"];
      const stripeSettings = getStripeSettings();
      const stripe = getStripeClient(stripeSettings.secretKey);

      if (!stripe || !stripeSettings.webhookSecret) {
        sendJson(response, 500, {
          error: "Stripe Secret Key or Stripe Webhook Secret is not configured.",
        });
        return;
      }

      let stripeEvent;

      try {
        stripeEvent = stripe.webhooks.constructEvent(
          rawBody,
          signature,
          stripeSettings.webhookSecret,
        );
      } catch (error) {
        await firebaseClient.updateStripeDiagnostic({
          lastEventReceivedAt: new Date().toISOString(),
          lastStatus: "invalid event",
          lastError: error instanceof Error ? error.message : "Invalid Stripe signature.",
        });
        sendJson(response, 400, { error: "Invalid Stripe signature." });
        return;
      }

      const checkInInput = extractStripeCheckInInput(stripeEvent);

      if (!checkInInput) {
        sendJson(response, 200, { received: true, ignored: true });
        return;
      }

      const paymentKeys = [
        `event:${checkInInput.stripeEventId}`,
        checkInInput.stripePaymentIntentId
          ? `paymentIntent:${checkInInput.stripePaymentIntentId}`
          : "",
        checkInInput.stripeCheckoutSessionId
          ? `checkoutSession:${checkInInput.stripeCheckoutSessionId}`
          : "",
      ].filter(Boolean);

      if (paymentKeys.some((key) => processedStripeEvents.has(key))) {
        sendJson(response, 200, { received: true, duplicate: true });
        return;
      }

      if (!checkInInput.reservationCode) {
        await firebaseClient.updateStripeDiagnostic({
          lastEventReceivedAt: new Date().toISOString(),
          lastStripeEventId: checkInInput.stripeEventId,
          lastReservationNumber: "",
          lastFullName: checkInInput.fullName,
          lastStatus: "invalid event",
          lastError: "reservationNumber is missing in metadata.",
        });
        await Promise.all(paymentKeys.map((key) => processedStripeEvents.mark(key)));
        sendJson(response, 200, { received: true, incomplete: true });
        return;
      }

      const checkIn = await eventProcessor.processCheckInEvent(checkInInput);
      await Promise.all(paymentKeys.map((key) => processedStripeEvents.mark(key)));
      sendJson(response, 201, checkIn);
      return;
    }

    if (request.method === "DELETE" && pathname.startsWith("/api/detections/")) {
      const detectionId = decodeURIComponent(pathname.replace("/api/detections/", ""));

      try {
        console.log(`[Detection] Delete requested: ${detectionId}`);
        const detection = await firebaseClient.getDetection(detectionId);

        if (!detection) {
          console.warn(`[Detection] Delete failed: detection not found (${detectionId})`);
          sendJson(response, 404, { error: "Detection not found." });
          return;
        }

        if (detection.localSnapshotPath) {
          await fileStorage.deleteEvidencePath(detection.localSnapshotPath);
          console.log(`[Evidence] Snapshot deleted: ${detection.localSnapshotPath}`);
        }

        if (detection.localVideoPath) {
          await fileStorage.deleteEvidencePath(detection.localVideoPath);
          console.log(`[Evidence] Clip deleted: ${detection.localVideoPath}`);
        }

        await firebaseClient.deleteDetection(detectionId);
        console.log(`[Firebase] Detection deleted: ${detectionId}`);
        sendJson(response, 200, { success: true, deletedId: detectionId });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown delete failure.";
        console.warn(`[Detection] Delete failed: ${message}`);
        sendJson(response, 500, { error: message });
      }
      return;
    }

    const plateReleaseMatch = pathname.match(/^\/api\/plates\/([^/]+)\/release$/);
    if (request.method === "POST" && plateReleaseMatch) {
      const [, rawPlate] = plateReleaseMatch;
      await eventProcessor.releasePlateAssignment(decodeURIComponent(rawPlate));
      sendJson(response, 200, { success: true });
      return;
    }

    if (request.method === "POST" && pathname === "/api/test-detection") {
      const body = await readJsonBody(request);
      const plate = String(body.plate ?? "").trim();
      const camera = String(body.camera ?? "test").trim();
      const detectedAt = body.detectedAt
        ? new Date(String(body.detectedAt)).toISOString()
        : new Date().toISOString();

      if (!plate || !camera) {
        sendJson(response, 400, { error: "Plate and camera are required." });
        return;
      }

      const detection = await eventProcessor.processDetectionWithCooldown({
        plate,
        camera,
        detectedAt,
        snapshotUrl: body.snapshotUrl ? String(body.snapshotUrl) : undefined,
        videoUrl: body.videoUrl ? String(body.videoUrl) : undefined,
      });
      sendJson(response, detection ? 201 : 200, {
        detection,
        ignoredByCooldown: !detection,
      });
      return;
    }

    if (request.method === "POST" && pathname === "/api/test-checkin") {
      const body = await readJsonBody(request);
      const reservationCode = String(body.reservationCode ?? "").trim();
      const fullName = String(body.fullName ?? "").trim();

      if (!reservationCode || !fullName) {
        sendJson(response, 400, {
          error: "Reservation number and full name are required.",
        });
        return;
      }

      const checkIn = await eventProcessor.processCheckInEvent({
        reservationCode,
        fullName,
        checkInAt: new Date().toISOString(),
        source: "stripe",
      });
      sendJson(response, 201, checkIn);
      return;
    }

    sendJson(response, 404, { error: "Not found" });
  } catch (error) {
    sendJson(response, 500, {
      error: error instanceof Error ? error.message : "Unexpected server error",
    });
  }
});

server.listen(port, "127.0.0.1", () => {
  console.log(`[Backend] Listening on http://127.0.0.1:${port}`);
});

function scheduleNextPoll() {
  setTimeout(async () => {
    await pollFrigate();
    scheduleNextPoll();
  }, getFrigateSettings().pollIntervalMs);
}

void pollFrigate().finally(scheduleNextPoll);
