function cleanString(value) {
  return typeof value === "string" ? value.trim() : "";
}

export function shortVersion(value) {
  const clean = cleanString(value);
  return clean.length > 12 ? clean.slice(0, 12) : clean || "unknown";
}

export function getVersionPayload(env = process.env) {
  return {
    version: shortVersion(env.GIT_SHA || env.APP_VERSION),
    environment: cleanString(env.NODE_ENV) || "development",
  };
}
