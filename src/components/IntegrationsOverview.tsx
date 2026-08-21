import { Circle } from "lucide-react";
import type { BackendStatus } from "../services/backendApi";

interface IntegrationsOverviewProps {
  backendStatus?: BackendStatus;
  firebaseConnected: boolean;
}

function stateLabel(connected: boolean): string {
  return connected ? "Connected" : "Disconnected";
}

function formatSource(source?: string): string {
  if (source === "googleSheets") {
    return "Google Sheets";
  }

  if (source === "json") {
    return "JSON Feed";
  }

  return "Demo";
}

function formatDate(value?: string | null): string {
  if (!value) {
    return "-";
  }

  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "short",
    timeStyle: "medium",
  }).format(new Date(value));
}

export function IntegrationsOverview({
  backendStatus,
  firebaseConnected,
}: IntegrationsOverviewProps) {
  const frigateConnected = Boolean(backendStatus?.frigateConnected);
  const stripeConnected = Boolean(backendStatus?.stripeConfigured);

  const rows = [
    {
      label: "Frigate",
      value: stateLabel(frigateConnected),
      online: frigateConnected,
    },
    {
      label: "Frigate Version",
      value: backendStatus?.frigateVersion || "-",
      online: frigateConnected,
    },
    {
      label: "Last Poll",
      value: formatDate(backendStatus?.lastPollAt),
      online: frigateConnected,
    },
    {
      label: "Last Event",
      value: formatDate(backendStatus?.lastEventProcessed),
      online: Boolean(backendStatus?.lastEventProcessed),
    },
    {
      label: "Reservations",
      value: `${formatSource(backendStatus?.reservationSource)} · ${
        backendStatus?.reservationsLoaded ?? 0
      } loaded`,
      online: !backendStatus?.reservationLoadError,
    },
    {
      label: "Stripe",
      value: stripeConnected ? "Connected" : "Not configured",
      online: stripeConnected,
    },
    {
      label: "Firebase",
      value: stateLabel(firebaseConnected),
      online: firebaseConnected,
    },
    {
      label: "Backend",
      value: backendStatus?.backendOnline ? "Online" : "Unreachable",
      online: Boolean(backendStatus?.backendOnline),
    },
  ];

  return (
    <section className="panel overview-panel">
      <div className="section-heading">
        <h2>Integrations</h2>
      </div>
      <div className="overview-list">
        {rows.map((row) => (
          <div key={row.label}>
            <span className={row.online ? "overview-dot online" : "overview-dot offline"}>
              <Circle size={9} fill="currentColor" />
            </span>
            <strong>{row.label}</strong>
            <span>{row.value}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
