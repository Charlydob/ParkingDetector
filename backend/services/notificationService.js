function cleanString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function maskSecret(value) {
  const secret = cleanString(value);
  return secret ? `${"*".repeat(10)}${secret.slice(-4)}` : "";
}

export function getPublicNotificationSettings(settings = {}) {
  const telegram = settings.telegram || {};

  return {
    telegram: {
      enabled: Boolean(telegram.enabled),
      chatId: cleanString(telegram.chatId),
      botTokenMasked: maskSecret(telegram.botToken),
      botTokenConfigured: Boolean(cleanString(telegram.botToken)),
    },
  };
}

export async function sendCheckoutNotification({ tenantSettings, room, event }) {
  const telegram = tenantSettings?.notifications?.telegram || tenantSettings?.telegram || {};

  if (!telegram.enabled || !telegram.botToken || !telegram.chatId) {
    return { sent: false, skipped: true };
  }

  const time = new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(new Date(event.timestamp));
  const text = [
    `Room ${room.number} checked out.`,
    "Ready for cleaning.",
    `Source: ${event.source.toUpperCase()}`,
    `Time: ${time}`,
  ].join("\n");

  try {
    const response = await fetch(
      `https://api.telegram.org/bot${telegram.botToken}/sendMessage`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: telegram.chatId, text }),
      },
    );

    if (!response.ok) {
      throw new Error(`Telegram HTTP ${response.status}`);
    }

    return { sent: true };
  } catch (error) {
    console.warn(
      `[Notifications] Telegram checkout notification failed: ${
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
