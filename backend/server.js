import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import path from "node:path";

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
    "Access-Control-Allow-Origin": "http://localhost:5173",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  });
  response.end(JSON.stringify(payload));
}

async function readJsonBody(request) {
  const chunks = [];

  for await (const chunk of request) {
    chunks.push(chunk);
  }

  if (chunks.length === 0) {
    return {};
  }

  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

loadEnvFile();

const [
  { createEventProcessor },
  { createFileStorage },
  { createFirebaseClient },
  { createFrigateClient },
  { createProcessedEventsStore },
] = await Promise.all([
  import("./eventProcessor.js"),
  import("./fileStorage.js"),
  import("./firebaseClient.js"),
  import("./frigateClient.js"),
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
await fileStorage.ensureDirectories();

const eventProcessor = createEventProcessor({
  firebaseClient,
  frigateClient,
  fileStorage,
  processedEvents,
  onDetectionStored(detection) {
    status.lastEventProcessed = detection.detectedAt;
  },
});

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
      });
      return;
    }

    if (request.method === "POST" && request.url === "/api/test-detection") {
      const body = await readJsonBody(request);
      const plate = String(body.plate ?? "").trim();
      const camera = String(body.camera ?? "test").trim();

      if (!plate || !camera) {
        sendJson(response, 400, { error: "plate y camera son obligatorios." });
        return;
      }

      const detection = await eventProcessor.processFrigateDetection({
        plate,
        camera,
        detectedAt: new Date().toISOString(),
      });
      sendJson(response, 201, detection);
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
