const BACKEND_URL_STORAGE_KEY = "parkingDetector.backendUrl";
const DEFAULT_BACKEND_URL = "http://127.0.0.1:3001";

export function normalizeBackendUrl(url: string): string {
  return url.trim().replace(/\/+$/g, "");
}

export function validateBackendUrl(url: string): string {
  const normalizedUrl = normalizeBackendUrl(url);
  const parsedUrl = new URL(normalizedUrl);

  if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
    throw new Error("Backend URL must start with http:// or https://.");
  }

  return normalizedUrl;
}

export function getDefaultBackendUrl(): string {
  return normalizeBackendUrl(import.meta.env.VITE_BACKEND_URL || DEFAULT_BACKEND_URL);
}

export function getBackendUrl(): string {
  const savedUrl = localStorage.getItem(BACKEND_URL_STORAGE_KEY);

  if (savedUrl) {
    return normalizeBackendUrl(savedUrl);
  }

  return getDefaultBackendUrl();
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
