import {
  acceptUserInvitation,
  getInvitationByToken,
} from "../services/invitationService.js";
import { sessionCookieHeader } from "../services/sessionService.js";

export async function handleInvitationRoute({ request, pathname, body = {}, context }) {
  const { database } = context;
  const invitationMatch = pathname.match(/^\/api\/invitations\/([^/]+)$/);

  if (request.method === "GET" && invitationMatch) {
    return {
      status: 200,
      payload: await getInvitationByToken(database, decodeURIComponent(invitationMatch[1])),
    };
  }

  if (request.method === "POST" && invitationMatch) {
    const result = await acceptUserInvitation(
      database,
      body,
      decodeURIComponent(invitationMatch[1]),
    );
    const { session, ...payload } = result;

    return {
      status: 200,
      headers: {
        "Set-Cookie": sessionCookieHeader(session.id, session.expiresAt),
      },
      payload,
    };
  }

  return undefined;
}
