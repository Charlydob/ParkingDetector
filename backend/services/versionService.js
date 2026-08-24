function cleanString(value) {
  return typeof value === "string" ? value.trim() : "";
}

export function shortVersion(value) {
  const clean = cleanString(value);
  return clean.length > 12 ? clean.slice(0, 12) : clean || "unknown";
}

export function getVersionPayload(env = process.env) {
  const sha = cleanString(env.GIT_SHA || env.APP_VERSION) || "unknown";

  return {
    version: shortVersion(sha),
    sha,
    environment: cleanString(env.NODE_ENV) || "development",
  };
}
