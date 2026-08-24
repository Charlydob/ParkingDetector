import {
  createUserInvitation,
  getInvitationLink,
  listTenantUsersPayload,
  regenerateUserInvitation,
  revokeTenantMembership,
  revokeUserInvitation,
  updateTenantMembershipRole,
} from "../services/invitationService.js";
import { requireTenant, requireTenantAdmin, updateTenant } from "../services/tenantService.js";

function requestBaseUrl(request) {
  return (
    process.env.APP_ORIGIN ||
    process.env.FRONTEND_URL ||
    request.headers.origin ||
    `http://${request.headers.host || "127.0.0.1:5173"}`
  );
}

export async function handleUserManagementRoute({ request, pathname, body, context }) {
  const { database, session } = context;
  const tenantId = requireTenant(session);

  if (request.method === "PATCH" && pathname === "/api/tenant/profile") {
    requireTenantAdmin(session, tenantId);
    return {
      status: 200,
      payload: await updateTenant(database, tenantId, {
        name: body.name,
        displayName: body.displayName,
        basicInfo: body.basicInfo,
      }),
    };
  }

  if (request.method === "GET" && pathname === "/api/tenant/users") {
    return {
      status: 200,
      payload: await listTenantUsersPayload(database, session, tenantId),
    };
  }

  if (request.method === "POST" && pathname === "/api/tenant/invitations") {
    return {
      status: 201,
      payload: await createUserInvitation(database, session, tenantId, body, {
        baseUrl: requestBaseUrl(request),
      }),
    };
  }

  const membershipMatch = pathname.match(/^\/api\/tenant\/memberships\/([^/]+)$/);
  if (request.method === "PATCH" && membershipMatch) {
    return {
      status: 200,
      payload: await updateTenantMembershipRole(
        database,
        session,
        tenantId,
        decodeURIComponent(membershipMatch[1]),
        body.role,
      ),
    };
  }

  if (request.method === "DELETE" && membershipMatch) {
    return {
      status: 200,
      payload: await revokeTenantMembership(
        database,
        session,
        tenantId,
        decodeURIComponent(membershipMatch[1]),
      ),
    };
  }

  const invitationMatch = pathname.match(/^\/api\/tenant\/invitations\/([^/]+)$/);
  if (request.method === "GET" && invitationMatch) {
    return {
      status: 200,
      payload: await getInvitationLink(
        database,
        session,
        tenantId,
        decodeURIComponent(invitationMatch[1]),
        requestBaseUrl(request),
      ),
    };
  }

  if (request.method === "DELETE" && invitationMatch) {
    return {
      status: 200,
      payload: await revokeUserInvitation(
        database,
        session,
        tenantId,
        decodeURIComponent(invitationMatch[1]),
      ),
    };
  }

  const regenerateMatch = pathname.match(/^\/api\/tenant\/invitations\/([^/]+)\/regenerate$/);
  if (request.method === "POST" && regenerateMatch) {
    return {
      status: 200,
      payload: await regenerateUserInvitation(
        database,
        session,
        tenantId,
        decodeURIComponent(regenerateMatch[1]),
        requestBaseUrl(request),
      ),
    };
  }

  return undefined;
}
