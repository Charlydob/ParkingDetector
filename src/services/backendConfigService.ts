const BACKEND_URL_STORAGE_KEY = "parkingDetector.backendUrl";
const DEFAULT_BACKEND_URL = "";
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);

export function normalizeBackendUrl(url: string): string {
  return url.trim().replace(/\/+$/g, "");
}

export function validateBackendUrl(url: string): string {
  const normalizedUrl = normalizeBackendUrl(url);
  if (!normalizedUrl) {
    return "";
  }
  const parsedUrl = new URL(normalizedUrl);

  if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
    throw new Error("Backend URL must start with http:// or https://.");
  }

  return normalizedUrl;
}

export function getDefaultBackendUrl(): string {
  return normalizeBackendUrl(DEFAULT_BACKEND_URL);
}

export function getBackendUrl(): string {
  const savedUrl = localStorage.getItem(BACKEND_URL_STORAGE_KEY);

  if (savedUrl) {
    const normalizedUrl = normalizeBackendUrl(savedUrl);

    if (import.meta.env.DEV && isStaleLocalFrontendUrl(normalizedUrl)) {
      localStorage.removeItem(BACKEND_URL_STORAGE_KEY);
      return getDefaultBackendUrl();
    }

    return normalizedUrl;
  }

  return getDefaultBackendUrl();
}

function isStaleLocalFrontendUrl(url: string): boolean {
  try {
    const parsed = new URL(url);

    return LOCAL_HOSTS.has(parsed.hostname) && parsed.port !== "3001";
  } catch {
    return false;
  }
}

export function setBackendUrl(url: string): string {
  const normalizedUrl = validateBackendUrl(url);

  localStorage.setItem(BACKEND_URL_STORAGE_KEY, normalizedUrl);
  return normalizedUrl;
}

export function resetBackendUrl(): string {
  localStorage.removeItem(BACKEND_URL_STORAGE_KEY);
  return getDefaultBackendUrl();
}
