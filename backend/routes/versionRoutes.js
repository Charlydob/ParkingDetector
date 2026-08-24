import { getVersionPayload } from "../services/versionService.js";

export function handleVersionRoute({ request, pathname, env = process.env }) {
  if (request.method === "GET" && pathname === "/api/version") {
    return {
      status: 200,
      payload: getVersionPayload(env),
      headers: {
        "Cache-Control": "no-store",
      },
    };
  }

  return undefined;
}
