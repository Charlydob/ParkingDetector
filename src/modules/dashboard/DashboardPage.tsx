import { useEffect, useState } from "react";
import { getBackendStatus, getCheckoutOverview, getParkingDetections } from "../../services/backendApi";
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
  const [status, setStatus] = useState<BackendStatus>();
  const [checkout, setCheckout] = useState<CheckoutOverview>();
  const [detections, setDetections] = useState<Detection[]>([]);

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
