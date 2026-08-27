import { Copy } from "lucide-react";
import { useEffect, useState } from "react";
import { useAuth } from "../../auth/AuthContext";
import {
  generateTelegramStaffPairingCode,
  getBackendStatus,
  getCheckoutOverview,
  getParkingDetections,
} from "../../services/backendApi";
import type { BackendStatus } from "../../services/backendApi";
import type { CheckoutOverview } from "../../types/checkout";
import type { ModuleId } from "../../types/modules";
import type { Detection } from "../../types/detection";

function isToday(value?: string | null): boolean {
  if (!value) {
    return false;
  }

  const date = new Date(value);
  const today = new Date();
  return (
    date.getFullYear() === today.getFullYear() &&
    date.getMonth() === today.getMonth() &&
    date.getDate() === today.getDate()
  );
}

export function DashboardPage({ enabledModules }: { enabledModules: Record<ModuleId, boolean> }) {
  const { user } = useAuth();
  const [status, setStatus] = useState<BackendStatus>();
  const [checkout, setCheckout] = useState<CheckoutOverview>();
  const [detections, setDetections] = useState<Detection[]>([]);
  const [telegramPairing, setTelegramPairing] = useState<
    Awaited<ReturnType<typeof generateTelegramStaffPairingCode>> | undefined
  >();
  const [telegramBusy, setTelegramBusy] = useState(false);
  const [telegramNotice, setTelegramNotice] = useState("");

  useEffect(() => {
    void getBackendStatus().then(setStatus).catch(() => undefined);
    if (enabledModules.parking) {
      void getParkingDetections().then(setDetections).catch(() => undefined);
    }
    if (enabledModules.checkout) {
      void getCheckoutOverview().then(setCheckout).catch(() => undefined);
    }
  }, [enabledModules.checkout, enabledModules.parking]);

  const checkoutsToday = checkout?.events.filter((event) => isToday(event.timestamp)).length ?? 0;
  const waitingRooms =
    checkout?.rooms.filter((room) => room.status === "ready_for_cleaning").length ?? 0;
  const detectionsToday = detections.filter((detection) => isToday(detection.detectedAt)).length;
  const telegramCommand = telegramPairing ? `/staff ${telegramPairing.code}` : "";

  async function linkTelegram() {
    setTelegramBusy(true);
    setTelegramNotice("");
    try {
      setTelegramPairing(await generateTelegramStaffPairingCode());
    } catch (error) {
      setTelegramNotice(error instanceof Error ? error.message : "No se pudo generar el código.");
    } finally {
      setTelegramBusy(false);
    }
  }

  async function copyTelegramCommand() {
    try {
      await navigator.clipboard.writeText(telegramCommand);
      setTelegramNotice("Comando copiado.");
    } catch {
      setTelegramNotice("No se pudo copiar. Mantén pulsado el comando para copiarlo.");
    }
  }

  return (
    <section className="module-page">
      <div className="module-title">
        <div>
          <h1>Dashboard</h1>
          <p>Current operational signal from enabled modules.</p>
        </div>
      </div>
      <div className="platform-stats">
        {enabledModules.checkout && (
          <>
            <article className="stat-item">
              <span>Rooms waiting for cleaning</span>
              <strong>{waitingRooms}</strong>
            </article>
            <article className="stat-item">
              <span>Checkouts today</span>
              <strong>{checkoutsToday}</strong>
            </article>
          </>
        )}
        {enabledModules.parking && (
          <article className="stat-item">
            <span>Parking detections today</span>
            <strong>{detectionsToday}</strong>
          </article>
        )}
        <article className="stat-item">
          <span>Current reservations</span>
          <strong>{status?.reservationsLoaded ?? 0}</strong>
        </article>
      </div>
      <section className="panel telegram-link-card">
        <div className="section-heading">
          <h2>Telegram</h2>
        </div>
        {user?.telegramUserId ? (
          <div className="telegram-link-status">
            <strong>✅ Telegram vinculado</strong>
            {user.telegramUsername && <span>@{user.telegramUsername.replace(/^@/, "")}</span>}
          </div>
        ) : (
          <div className="telegram-link-content">
            <strong>Telegram no vinculado</strong>
            <p>Vincula tu usuario de Telegram para utilizar las funciones de housekeeping.</p>
            {!telegramPairing && (
              <button type="button" onClick={() => void linkTelegram()} disabled={telegramBusy}>
                {telegramBusy ? "Generando…" : "Vincular Telegram"}
              </button>
            )}
            {telegramPairing && (
              <div className="source-preview telegram-command">
                <code>{telegramCommand}</code>
                <p>Pega este comando en el bot de Telegram.</p>
                <div className="meta-list">
                  <span>Caduca</span>
                  <strong>{new Date(telegramPairing.expiresAt).toLocaleString()}</strong>
                </div>
                <div className="button-row">
                  <button type="button" onClick={() => void copyTelegramCommand()}>
                    <Copy size={15} /> Copiar
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
        {telegramNotice && <p className="telegram-link-notice" role="status">{telegramNotice}</p>}
      </section>
      <section className="panel">
        <div className="section-heading">
          <h2>Recent Activity</h2>
        </div>
        <div className="activity-list">
          {(checkout?.events || []).slice(0, 8).map((event) => {
            const room = checkout?.rooms.find((item) => item.id === event.roomId);
            return (
              <div key={event.id}>
                <span>{new Date(event.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                <strong>Room {room?.number || "-"}</strong>
                <span>Checkout via {event.source.toUpperCase()}</span>
              </div>
            );
          })}
          {(!checkout?.events || checkout.events.length === 0) && (
            <p className="empty-state">No recent activity.</p>
          )}
        </div>
      </section>
    </section>
  );
}
