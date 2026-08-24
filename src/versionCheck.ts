const compiledSha = import.meta.env.VITE_GIT_SHA || "unknown";
const reloadMarkerPrefix = "hotelapp:reloaded-for-sha:";

interface FrontendVersion {
  sha?: string;
  version?: string;
}

async function unregisterLegacyServiceWorkers() {
  if (!("serviceWorker" in navigator)) {
    return;
  }

  const registrations = await navigator.serviceWorker.getRegistrations();
  await Promise.all(
    registrations
      .filter((registration) => registration.scope.startsWith(window.location.origin))
      .map((registration) => registration.unregister()),
  );
}

function reloadWithVersion(sha: string) {
  const marker = `${reloadMarkerPrefix}${sha}`;

  if (sessionStorage.getItem(marker) === "1") {
    return;
  }

  sessionStorage.setItem(marker, "1");
  const nextUrl = new URL(window.location.href);
  nextUrl.searchParams.set("appVersion", sha);
  window.location.replace(nextUrl.toString());
}

export async function checkFrontendVersion() {
  if (!compiledSha || compiledSha === "unknown") {
    return;
  }

  const response = await fetch(`/version.json?t=${Date.now()}`, {
    cache: "no-store",
    credentials: "same-origin",
  });

  if (!response.ok) {
    return;
  }

  const payload = (await response.json().catch(() => ({}))) as FrontendVersion;
  const servedSha = (payload.sha || payload.version || "").trim();

  if (servedSha && servedSha !== compiledSha) {
    reloadWithVersion(servedSha);
  }
}

export function startFrontendVersionChecks() {
  void unregisterLegacyServiceWorkers().catch(() => undefined);
  void checkFrontendVersion().catch(() => undefined);

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      void checkFrontendVersion().catch(() => undefined);
    }
  });
}
