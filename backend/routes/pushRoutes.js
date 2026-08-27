import {
  getPushStatus,
  schedulePush,
  sendTestPushToSubscription,
  subscribeUserPush,
  unsubscribeUserPush,
  updatePushPreference,
} from "../services/webPushService.js";
import { requireTenant } from "../services/tenantService.js";

function clampDelaySeconds(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return 20;
  }

  return Math.max(5, Math.min(600, Math.round(parsed)));
}

export async function handlePushRoute({ request, pathname, body, context }) {
  const { database, session } = context;
  const userId = session.user.id;
  const tenantId = session.activeTenantId || "";

  if (request.method === "GET" && pathname === "/api/push/status") {
    return {
      status: 200,
      payload: await getPushStatus(database, { userId, tenantId }),
    };
  }

  if (request.method === "POST" && pathname === "/api/push/subscribe") {
    return {
      status: 201,
      payload: await subscribeUserPush(database, {
        userId,
        tenantId,
        subscription: body.subscription || body,
        userAgent: request.headers["user-agent"] || "",
      }),
    };
  }

  if (request.method === "POST" && pathname === "/api/push/unsubscribe") {
    return {
      status: 200,
      payload: await unsubscribeUserPush(database, {
        userId,
        endpoint: body.endpoint || body.subscription?.endpoint,
      }),
    };
  }

  if (request.method === "PATCH" && pathname === "/api/push/preferences") {
    const activeTenantId = requireTenant(session);
    return {
      status: 200,
      payload: await updatePushPreference(database, userId, activeTenantId, body),
    };
  }

  if (request.method === "POST" && pathname === "/api/push/test") {
    const activeTenantId = requireTenant(session);
    const tenant = await database.getRecord("tenants", activeTenantId);
    const result = await sendTestPushToSubscription(database, {
      userId,
      endpoint: body.endpoint,
      tenant,
    });

    return {
      status: result.sent ? 200 : 502,
      payload: {
        success: Boolean(result.sent),
        error: result.error || "",
        httpStatus: result.httpStatus,
      },
    };
  }

  if (request.method === "POST" && pathname === "/api/push/test-schedule") {
    const activeTenantId = requireTenant(session);
    const tenant = await database.getRecord("tenants", activeTenantId);
    const delaySeconds = clampDelaySeconds(body.delaySeconds);
    const sendAt = new Date(Date.now() + delaySeconds * 1000).toISOString();
    const scheduled = await schedulePush(database, {
      userId,
      tenantId: activeTenantId,
      endpoint: body.endpoint,
      title: "🔔 HotelApp",
      body: "Las notificaciones Web Push funcionan correctamente.",
      url: tenant?.slug ? `/t/${encodeURIComponent(tenant.slug)}/` : "/",
      sendAt,
    });

    return {
      status: 201,
      payload: {
        success: true,
        delaySeconds,
        scheduled,
      },
    };
  }

  return undefined;
}
