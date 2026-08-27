const ICON_URL = "/hotelapp-icon.svg";

self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

function parsePushPayload(event) {
  if (!event.data) {
    return {};
  }

  try {
    return event.data.json();
  } catch {
    return {
      title: "HotelApp",
      body: event.data.text(),
    };
  }
}

async function updateBadge(count) {
  try {
    if (Number(count) > 0 && self.registration.setAppBadge) {
      await self.registration.setAppBadge(Number(count));
    } else if (Number(count) <= 0 && self.registration.clearAppBadge) {
      await self.registration.clearAppBadge();
    }
  } catch {
    // Badging is optional.
  }
}

async function notifyOpenWindows(payload) {
  const windows = await self.clients.matchAll({
    type: "window",
    includeUncontrolled: true,
  });

  for (const client of windows) {
    client.postMessage({
      type: "HOTELAPP_PUSH_RECEIVED",
      payload,
    });
  }
}

self.addEventListener("push", (event) => {
  const payload = parsePushPayload(event);
  const title = payload.title || "HotelApp";
  const options = {
    body: payload.body || "",
    icon: payload.icon || ICON_URL,
    badge: payload.badgeIcon || ICON_URL,
    tag: payload.tag || payload.eventId || payload.type || "hotelapp",
    data: {
      url: payload.url || "/",
      tenantId: payload.tenantId || "",
      tenantSlug: payload.tenantSlug || "",
      roomId: payload.roomId || "",
      roomNumber: payload.roomNumber || "",
      eventId: payload.eventId || "",
      type: payload.type || "",
    },
  };

  event.waitUntil(
    Promise.all([
      self.registration.showNotification(title, options),
      notifyOpenWindows(payload),
      updateBadge(payload.badge),
    ]),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = new URL(event.notification.data?.url || "/", self.location.origin).href;

  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });

      for (const client of windows) {
        const clientUrl = new URL(client.url);
        if (clientUrl.origin !== self.location.origin) {
          continue;
        }

        if ("navigate" in client && client.url !== targetUrl) {
          await client.navigate(targetUrl);
        }

        return client.focus();
      }

      return self.clients.openWindow(targetUrl);
    })(),
  );
});
