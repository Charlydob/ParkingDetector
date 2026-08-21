import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import path from "node:path";
import Stripe from "stripe";
import { STRIPE_FIELD_MAPPING } from "./config/stripeMapping.js";

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
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Stripe-Signature",
  });
  response.end(JSON.stringify(payload));
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
  const fullName =
    metadataFullName ||
    (typeof stripeObject.customer_details?.name === "string"
      ? stripeObject.customer_details.name.trim()
      : "");

  if (stripeEvent.type === "checkout.session.completed") {
    return {
      reservationCode,
      fullName,
      checkInAt: new Date(stripeEvent.created * 1000).toISOString(),
      source: "stripe",
      stripeEventId: stripeEvent.id,
      stripePaymentIntentId:
        typeof stripeObject.payment_intent === "string"
          ? stripeObject.payment_intent
          : stripeObject.payment_intent?.id,
      stripeCheckoutSessionId: stripeObject.id,
    };
  }

  if (stripeEvent.type === "payment_intent.succeeded") {
    return {
      reservationCode,
      fullName,
      checkInAt: new Date(stripeEvent.created * 1000).toISOString(),
      source: "stripe",
      stripeEventId: stripeEvent.id,
      stripePaymentIntentId: stripeObject.id,
    };
  }

  return undefined;
}

loadEnvFile();

const [
  { createEventProcessor },
  {
    forceRefreshReservations,
    getReservations,
    getReservationDebug,
    getReservationDiagnostics,
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
const pollIntervalMs = Number(process.env.FRIGATE_POLL_INTERVAL_MS || 5000);
const status = {
  running: true,
  frigateConnected: false,
  lastPollAt: null,
  lastEventProcessed: null,
};

const firebaseClient = createFirebaseClient();
const frigateClient = createFrigateClient();
const fileStorage = createFileStorage();
const processedEvents = await createProcessedEventsStore();
const processedStripeEvents = await createProcessedEventsStore(
  path.resolve(process.cwd(), "backend/data/processed-stripe-events.json"),
);
const plateCooldown = await createPlateCooldownStore();
const stripe = process.env.STRIPE_SECRET_KEY
  ? new Stripe(process.env.STRIPE_SECRET_KEY)
  : undefined;
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
    const events = await frigateClient.getRecentCarEvents();
    status.frigateConnected = true;
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
  await frigateClient.testConnection();
  status.frigateConnected = true;
  console.log("[Frigate] Connected");
} catch (error) {
  console.warn(`[Frigate] Not connected: ${error.message}`);
}

const server = createServer(async (request, response) => {
  if (request.method === "OPTIONS") {
    sendJson(response, 204, {});
    return;
  }

  try {
    if (request.method === "GET" && request.url === "/api/status") {
      sendJson(response, 200, {
        ...status,
        processedEvents: processedEvents.count(),
        processedStripeEvents: processedStripeEvents.count(),
        plateCooldownEntries: plateCooldown.count(),
        ...getReservationDiagnostics(),
      });
      return;
    }

    if (request.method === "GET" && request.url === "/api/reservations/debug") {
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

    if (request.method === "POST" && request.url === "/api/reservations/refresh") {
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

    if (request.method === "POST" && request.url === "/api/stripe/webhook") {
      const rawBody = await readRawBody(request);
      const signature = request.headers["stripe-signature"];

      if (!stripe || !process.env.STRIPE_WEBHOOK_SECRET) {
        sendJson(response, 500, {
          error: "Faltan STRIPE_SECRET_KEY o STRIPE_WEBHOOK_SECRET.",
        });
        return;
      }

      let stripeEvent;

      try {
        stripeEvent = stripe.webhooks.constructEvent(
          rawBody,
          signature,
          process.env.STRIPE_WEBHOOK_SECRET,
        );
      } catch (error) {
        await firebaseClient.updateStripeDiagnostic({
          lastEventReceivedAt: new Date().toISOString(),
          lastStatus: "invalid event",
          lastError: error instanceof Error ? error.message : "Firma Stripe invalida.",
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
          lastError: "Falta reservationNumber en metadata.",
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

    if (request.method === "POST" && request.url === "/api/test-detection") {
      const body = await readJsonBody(request);
      const plate = String(body.plate ?? "").trim();
      const camera = String(body.camera ?? "test").trim();
      const detectedAt = body.detectedAt
        ? new Date(String(body.detectedAt)).toISOString()
        : new Date().toISOString();

      if (!plate || !camera) {
        sendJson(response, 400, { error: "plate y camera son obligatorios." });
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

    if (request.method === "POST" && request.url === "/api/test-checkin") {
      const body = await readJsonBody(request);
      const reservationCode = String(body.reservationCode ?? "").trim();
      const fullName = String(body.fullName ?? "").trim();

      if (!reservationCode || !fullName) {
        sendJson(response, 400, {
          error: "reservationCode y fullName son obligatorios.",
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

setInterval(() => {
  void pollFrigate();
}, pollIntervalMs);

void pollFrigate();
