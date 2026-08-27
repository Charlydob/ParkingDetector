import {
  getPushStatus,
  subscribePushDevice,
  unsubscribePushDevice,
  updatePushPreferences,
} from "./backendApi";

export function browserSupportsWebPush(): boolean {
  return "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

export function appIsStandalone(): boolean {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    Boolean((navigator as Navigator & { standalone?: boolean }).standalone)
  );
}

export function shouldShowIosInstallHint(): boolean {
  const platform = navigator.userAgent || "";
  const isiPhoneOrPad = /iPad|iPhone|iPod/.test(platform);

  return isiPhoneOrPad && !appIsStandalone() && "Notification" in window;
}

function urlBase64ToArrayBuffer(base64String: string): ArrayBuffer {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = `${base64String}${padding}`.replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const buffer = new ArrayBuffer(rawData.length);
  const outputArray = new Uint8Array(buffer);

  for (let index = 0; index < rawData.length; index += 1) {
    outputArray[index] = rawData.charCodeAt(index);
  }

  return buffer;
}

export async function registerHotelAppServiceWorker(): Promise<ServiceWorkerRegistration> {
  if (!("serviceWorker" in navigator)) {
    throw new Error("Service workers are not supported by this browser.");
  }

  await navigator.serviceWorker.register("/sw.js");
  return navigator.serviceWorker.ready;
}

export async function getCurrentBrowserSubscription(): Promise<PushSubscription | null> {
  if (!browserSupportsWebPush()) {
    return null;
  }

  const registration = await registerHotelAppServiceWorker();
  return registration.pushManager.getSubscription();
}

export async function activatePushDevice(): Promise<PushSubscription> {
  if (!browserSupportsWebPush()) {
    throw new Error("Este dispositivo/navegador no soporta Web Push.");
  }

  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    throw new Error("Permiso de notificaciones no concedido.");
  }

  const [registration, status] = await Promise.all([
    registerHotelAppServiceWorker(),
    getPushStatus(),
  ]);

  if (!status.configured || !status.vapidPublicKey) {
    throw new Error("Web Push no esta configurado en el servidor.");
  }

  const existing = await registration.pushManager.getSubscription();
  const subscription =
    existing ||
    (await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToArrayBuffer(status.vapidPublicKey),
    }));

  await subscribePushDevice(subscription.toJSON());
  await updatePushPreferences({ enabled: true });

  return subscription;
}

export async function deactivatePushDevice(): Promise<void> {
  const subscription = await getCurrentBrowserSubscription();

  if (subscription) {
    await unsubscribePushDevice(subscription.endpoint);
    await subscription.unsubscribe().catch(() => false);
  }
}

export async function updateAppBadge(count: number): Promise<void> {
  const nav = navigator as Navigator & {
    setAppBadge?: (count?: number) => Promise<void>;
    clearAppBadge?: () => Promise<void>;
  };

  try {
    if (count > 0 && nav.setAppBadge) {
      await nav.setAppBadge(count);
    } else if (count <= 0 && nav.clearAppBadge) {
      await nav.clearAppBadge();
    }
  } catch {
    // Badge support is optional.
  }
}
