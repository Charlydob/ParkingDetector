function cleanString(value) {
  return typeof value === "string" ? value.trim() : "";
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
    },
  };
}

export async function sendCheckoutNotification({ tenant, tenantSettings, room, event }) {
  const telegram = tenantSettings?.notifications?.telegram || tenantSettings?.telegram || {};

  if (!telegram.enabled || !cleanString(telegram.chatId)) {
    return { sent: false, skipped: true };
  }

  const webhookUrl = cleanString(process.env.N8N_CHECKOUT_WEBHOOK_URL);
  const webhookSecret = cleanString(process.env.N8N_CHECKOUT_WEBHOOK_SECRET);

  if (!webhookUrl || !webhookSecret) {
    console.warn("[Notifications] n8n checkout webhook is not configured.");
    return { sent: false, skipped: true };
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
      throw new Error(`n8n HTTP ${response.status}`);
    }

    return { sent: true };
  } catch (error) {
    console.warn(
      `[Notifications] n8n checkout webhook failed: ${
        error instanceof Error ? error.message : "unknown error"
      }`,
    );
    return { sent: false, error: error instanceof Error ? error.message : "unknown error" };
  }
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
