const DEFAULT_FRIGATE_BASE_URL = "https://localhost:8971";
const DEFAULT_EVENT_LIMIT = 50;
const DEFAULT_LOOKBACK_MS = 5 * 60 * 1000;

function trimTrailingSlash(value) {
  return value.replace(/\/+$/g, "");
}

function createAuthHeader() {
  const username = process.env.FRIGATE_USERNAME || "";
  const password = process.env.FRIGATE_PASSWORD || "";

  if (!username && !password) {
    return {};
  }

  return {
    Authorization: `Basic ${Buffer.from(`${username}:${password}`).toString("base64")}`,
  };
}

function findPlateValue(value) {
  if (!value || typeof value !== "object") {
    return undefined;
  }

  if (typeof value.recognized_license_plate === "string") {
    return value.recognized_license_plate;
  }

  for (const nestedValue of Object.values(value)) {
    if (Array.isArray(nestedValue)) {
      for (const item of nestedValue) {
        const match = findPlateValue(item);
        if (match) {
          return match;
        }
      }
      continue;
    }

    if (nestedValue && typeof nestedValue === "object") {
      const match = findPlateValue(nestedValue);
      if (match) {
        return match;
      }
    }
  }

  return undefined;
}

export function getRecognizedLicensePlate(event) {
  return findPlateValue(event);
}

export function getEventDetectedAt(event) {
  const seconds = event.start_time ?? event.end_time;

  if (typeof seconds === "number") {
    return new Date(seconds * 1000).toISOString();
  }

  return new Date().toISOString();
}

export function createFrigateClient({
  baseUrl = process.env.FRIGATE_BASE_URL || DEFAULT_FRIGATE_BASE_URL,
  eventLimit = DEFAULT_EVENT_LIMIT,
  lookbackMs = DEFAULT_LOOKBACK_MS,
} = {}) {
  const normalizedBaseUrl = trimTrailingSlash(baseUrl);
  const authHeader = createAuthHeader();

  async function request(path, { optional = false } = {}) {
    const response = await fetch(`${normalizedBaseUrl}${path}`, {
      headers: {
        Accept: "*/*",
        ...authHeader,
      },
    });

    if (!response.ok) {
      if (optional && response.status === 404) {
        return undefined;
      }

      throw new Error(`Frigate ${response.status} en ${path}`);
    }

    return response;
  }

  async function getRecentCarEvents() {
    const after = Math.floor((Date.now() - lookbackMs) / 1000);
    const params = new URLSearchParams({
      label: "car",
      limit: String(eventLimit),
      after: String(after),
    });
    const response = await request(`/api/events?${params.toString()}`);
    const events = await response.json();

    if (!Array.isArray(events)) {
      return [];
    }

    return events.filter((event) => event.label === "car");
  }

  async function getSnapshotBuffer(eventId) {
    const response = await request(`/api/events/${encodeURIComponent(eventId)}/snapshot.jpg`, {
      optional: true,
    });

    if (!response) {
      return undefined;
    }

    return Buffer.from(await response.arrayBuffer());
  }

  async function getClipBuffer(eventId) {
    const response = await request(`/api/events/${encodeURIComponent(eventId)}/clip.mp4`, {
      optional: true,
    });

    if (!response) {
      return undefined;
    }

    return Buffer.from(await response.arrayBuffer());
  }

  return {
    baseUrl: normalizedBaseUrl,
    async testConnection() {
      await request("/api/events?limit=1");
      return true;
    },
    getRecentCarEvents,
    getSnapshotBuffer,
    getClipBuffer,
  };
}
