function cleanString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function publicDiagnostics(diagnostics = {}) {
  return {
    lastAttemptAt: cleanString(diagnostics.lastAttemptAt),
    lastSuccessAt: cleanString(diagnostics.lastSuccessAt),
    lastError: cleanString(diagnostics.lastError),
    httpStatus: diagnostics.httpStatus === undefined ? undefined : Number(diagnostics.httpStatus),
    checkoutEventId: cleanString(diagnostics.checkoutEventId),
    room: cleanString(diagnostics.room),
    source: cleanString(diagnostics.source),
  };
}

function diagnosticPayload({ event, room, patch = {} }) {
  return {
    lastAttemptAt: new Date().toISOString(),
    checkoutEventId: cleanString(event?.id),
    room: cleanString(room?.number),
    source: cleanString(event?.source),
    ...patch,
  };
}

async function saveTelegramDiagnostics(database, tenantId, diagnostics) {
  if (!database || !tenantId) {
    return;
  }

  const current = (await database.getRecord("tenantSettings", tenantId)) || {};
  const notifications = current.notifications || {};
  const telegram = notifications.telegram || {};

  await database.setRecord("tenantSettings", tenantId, {
    ...current,
    notifications: {
      ...notifications,
      telegram: {
        ...telegram,
        diagnostics: {
          ...(telegram.diagnostics || {}),
          ...diagnostics,
        },
      },
    },
  });
}

export function getPublicNotificationSettings(settings = {}) {
  const telegram = settings.telegram || {};

  return {
    telegram: {
      enabled: Boolean(telegram.enabled),
      chatId: cleanString(telegram.chatId),
      chatTitle: cleanString(telegram.chatTitle),
      chatType: cleanString(telegram.chatType),
      connectedAt: cleanString(telegram.connectedAt),
      diagnostics: publicDiagnostics(telegram.diagnostics),
    },
  };
}

export async function sendCheckoutNotification({ database, tenant, tenantSettings, room, event }) {
  const telegram = tenantSettings?.notifications?.telegram || tenantSettings?.telegram || {};
  const tenantId = tenant?.id || event?.tenantId;

  if (!telegram.enabled || !cleanString(telegram.chatId)) {
    const diagnostics = diagnosticPayload({
      event,
      room,
      patch: {
        lastError: "Telegram notification is not enabled or chatId is missing.",
        httpStatus: undefined,
      },
    });
    await saveTelegramDiagnostics(database, tenantId, diagnostics);
    return { sent: false, skipped: true, diagnostics };
  }

  const webhookUrl = cleanString(process.env.N8N_CHECKOUT_WEBHOOK_URL);
  const webhookSecret = cleanString(process.env.N8N_CHECKOUT_WEBHOOK_SECRET);

  if (!webhookUrl || !webhookSecret) {
    console.warn("[Notifications] n8n checkout webhook is not configured.");
    const diagnostics = diagnosticPayload({
      event,
      room,
      patch: {
        lastError: "n8n checkout webhook is not configured.",
        httpStatus: undefined,
      },
    });
    await saveTelegramDiagnostics(database, tenantId, diagnostics);
    return { sent: false, skipped: true, diagnostics };
  }

  const payload = {
    event: "checkout.completed",
    tenant: {
      id: tenant?.id || event.tenantId,
      slug: tenant?.slug || "",
      name: tenant?.name || "",
    },
    room: {
      id: room.id,
      number: room.number,
      name: room.name || "",
    },
    checkout: {
      id: event.id,
      source: event.source,
      timestamp: event.timestamp,
    },
    notification: {
      chatId: cleanString(telegram.chatId),
    },
  };

  try {
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-HotelApp-Secret": webhookSecret,
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const error = new Error(`n8n HTTP ${response.status}`);
      error.httpStatus = response.status;
      throw error;
    }

    const diagnostics = diagnosticPayload({
      event,
      room,
      patch: {
        lastSuccessAt: new Date().toISOString(),
        lastError: "",
        httpStatus: response.status,
      },
    });
    await saveTelegramDiagnostics(database, tenantId, diagnostics);

    return { sent: true, httpStatus: response.status, diagnostics };
  } catch (error) {
    const httpStatus = Number(error?.httpStatus) || undefined;
    const message = error instanceof Error ? error.message : "unknown error";
    console.warn(`[Notifications] n8n checkout webhook failed: ${message}`);
    const diagnostics = diagnosticPayload({
      event,
      room,
      patch: {
        lastError: message,
        httpStatus,
      },
    });
    await saveTelegramDiagnostics(database, tenantId, diagnostics);

    return { sent: false, error: message, httpStatus, diagnostics };
  }
}

export async function sendTestCheckoutNotification({ database, tenant, tenantSettings }) {
  const event = {
    id: `test-${Date.now()}`,
    tenantId: tenant?.id || tenantSettings?.tenantId || "",
    source: "test",
    timestamp: new Date().toISOString(),
  };
  const room = {
    id: "test-room",
    number: "Test",
    name: "Telegram test",
  };

  return sendCheckoutNotification({
    database,
    tenant,
    tenantSettings,
    room,
    event,
  });
}

export async function getTelegramDiagnostics(database, tenantId) {
  const settings = await database.getRecord("tenantSettings", tenantId);
  return publicDiagnostics(settings?.notifications?.telegram?.diagnostics);
}

export async function sendUserInvitationNotification({ invitation, tenant, inviteUrl }) {
  return {
    sent: false,
    skipped: true,
    invitationId: invitation.id,
    tenantId: tenant?.id || invitation.tenantId,
    inviteUrl,
  };
}
