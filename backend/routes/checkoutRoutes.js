import QRCode from "qrcode";
import {
  createKeyIdentifier,
  createRoom,
  createKeyIdentifiersBulk,
  createRoomsBulk,
  listCheckoutOverview,
  listKeyIdentifiers,
  registerCheckout,
  registerCheckoutByIdentifier,
  resolveCheckoutByIdentifier,
  updateKeyIdentifier,
  updateRoom,
} from "../services/checkoutService.js";
import { requireModule, requireTenantAdmin } from "../services/tenantService.js";

function publicBaseUrl(request) {
  return (
    process.env.PUBLIC_APP_URL ||
    `${request.headers["x-forwarded-proto"] || "http"}://${request.headers.host}`
  ).replace(/\/+$/g, "");
}

function keyCheckoutUrl(request, key) {
  return `${publicBaseUrl(request)}/checkout/${encodeURIComponent(key.identifier)}`;
}

async function withQrPayload(request, key) {
  const checkoutUrl = keyCheckoutUrl(request, key);

  return {
    ...key,
    checkoutUrl,
    qrDataUrl: await QRCode.toDataURL(checkoutUrl),
  };
}

export async function handleCheckoutRoute({ request, pathname, parsedUrl, body, context }) {
  const { database, session } = context;
  const tenantId = await requireModule(database, session, "checkout");

  if (request.method === "GET" && pathname === "/api/checkout/overview") {
    const tenant = await database.getRecord("tenants", tenantId);
    const overview = await listCheckoutOverview(database, tenantId);
    const publicUrl = `${publicBaseUrl(request)}/public/${tenant.slug}/checkout`;

    return {
      status: 200,
      payload: {
        ...overview,
        publicUrl,
        publicQrDataUrl: await QRCode.toDataURL(publicUrl),
      },
    };
  }

  if (request.method === "GET" && pathname === "/api/checkout/keys") {
    const keys = await listKeyIdentifiers(database, tenantId);
    return { status: 200, payload: keys };
  }

  if (request.method === "POST" && pathname === "/api/checkout/rooms") {
    requireTenantAdmin(session, tenantId);
    return { status: 201, payload: await createRoom(database, tenantId, body) };
  }

  if (request.method === "POST" && pathname === "/api/checkout/rooms/bulk") {
    requireTenantAdmin(session, tenantId);
    const result = await createRoomsBulk(database, tenantId, body);
    return {
      status: 201,
      payload: {
        ...result,
        keys: await Promise.all(result.keys.map((key) => withQrPayload(request, key))),
      },
    };
  }

  const roomMatch = pathname.match(/^\/api\/checkout\/rooms\/([^/]+)$/);
  if (request.method === "PATCH" && roomMatch) {
    requireTenantAdmin(session, tenantId);
    return {
      status: 200,
      payload: await updateRoom(database, tenantId, decodeURIComponent(roomMatch[1]), body),
    };
  }

  if (request.method === "POST" && pathname === "/api/checkout/keys") {
    requireTenantAdmin(session, tenantId);
    const key = await createKeyIdentifier(database, tenantId, body);
    return {
      status: 201,
      payload: await withQrPayload(request, key),
    };
  }

  if (request.method === "POST" && pathname === "/api/checkout/keys/bulk") {
    requireTenantAdmin(session, tenantId);
    const result = await createKeyIdentifiersBulk(database, tenantId, body);
    return {
      status: 201,
      payload: {
        ...result,
        keys: await Promise.all(
          [...result.created, ...result.regenerated].map((key) => withQrPayload(request, key)),
        ),
      },
    };
  }

  const keyMatch = pathname.match(/^\/api\/checkout\/keys\/([^/]+)$/);
  if (request.method === "PATCH" && keyMatch) {
    requireTenantAdmin(session, tenantId);
    const key = await updateKeyIdentifier(
      database,
      tenantId,
      decodeURIComponent(keyMatch[1]),
      body,
    );
    return {
      status: 200,
      payload: await withQrPayload(request, key),
    };
  }

  const keyQrMatch = pathname.match(/^\/api\/checkout\/keys\/([^/]+)\/qr$/);
  if (request.method === "GET" && keyQrMatch) {
    const key = await database.getTenantRecord(
      "keyIdentifiers",
      tenantId,
      decodeURIComponent(keyQrMatch[1]),
    );

    if (!key) {
      const error = new Error("Key identifier not found.");
      error.statusCode = 404;
      throw error;
    }

    return {
      status: 200,
      payload: {
        checkoutUrl: keyCheckoutUrl(request, key),
        qrDataUrl: await QRCode.toDataURL(keyCheckoutUrl(request, key)),
      },
    };
  }

  if (request.method === "POST" && pathname === "/api/checkout/manual") {
    const roomId = String(body.roomId || "").trim();
    return {
      status: 201,
      payload: await registerCheckout(database, tenantId, roomId, "manual", {
        sourceIdentifier: `manual:${session.user.id}`,
        metadata: { userId: session.user.id },
      }),
    };
  }

  return undefined;
}

export async function handlePublicCheckoutRoute({ request, pathname, body = {}, context }) {
  const { database, publicCheckoutLimiter } = context;

  const publicPageMatch = pathname.match(/^\/api\/public\/tenants\/([^/]+)\/checkout$/);
  if (request.method === "GET" && publicPageMatch) {
    const slug = decodeURIComponent(publicPageMatch[1]);
    const tenant = (await database.listRecords("tenants")).find(
      (item) => item.slug === slug && item.active !== false,
    );

    if (!tenant) {
      const error = new Error("Hotel checkout is not available.");
      error.statusCode = 404;
      throw error;
    }

    const modules = await database.getTenantModules(tenant.id);
    if (!modules.checkout) {
      const error = new Error("Hotel checkout is not available.");
      error.statusCode = 404;
      throw error;
    }

    return {
      status: 200,
      payload: {
        tenantName: tenant.name,
        slug: tenant.slug,
        enabled: true,
      },
    };
  }

  const checkoutMatch = pathname.match(/^\/api\/public\/checkout\/([^/]+)$/);
  if (request.method === "GET" && checkoutMatch) {
    return {
      status: 200,
      payload: await resolveCheckoutByIdentifier(
        database,
        decodeURIComponent(checkoutMatch[1]),
        "qr",
      ),
    };
  }

  if (request.method === "POST" && checkoutMatch) {
    const ip = request.socket?.remoteAddress || "unknown";
    const checkoutIdentifier = decodeURIComponent(checkoutMatch[1]);

    if (!publicCheckoutLimiter.allow(`${ip}:${checkoutIdentifier}`)) {
      const error = new Error("Too many checkout attempts. Please wait a moment.");
      error.statusCode = 429;
      error.code = "RATE_LIMITED";
      throw error;
    }

    const result = await registerCheckoutByIdentifier(
      database,
      checkoutIdentifier,
      "qr",
      { attemptToken: body.attemptToken },
    );

    return {
      status: 200,
      payload: {
        success: true,
        duplicate: result.duplicate,
        timestamp: result.event.timestamp,
        room: {
          number: result.room.number,
        },
      },
    };
  }

  return undefined;
}
