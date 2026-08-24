import { authenticateSessionRequest } from "../services/sessionService.js";

export async function authenticateRequest(request, database) {
  return authenticateSessionRequest(database, request);
}
