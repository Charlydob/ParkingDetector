import type { StripeDiagnostic } from "../types/detection";

interface StripeDiagnosticsProps {
  diagnostic: StripeDiagnostic;
  stripeConfigured?: boolean;
}

function formatMaybeDate(value?: string): string {
  if (!value) {
    return "-";
  }

  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "short",
    timeStyle: "medium",
  }).format(new Date(value));
}

export function StripeDiagnostics({ diagnostic, stripeConfigured }: StripeDiagnosticsProps) {
  return (
    <section className="panel stripe-panel">
      <div className="section-heading">
        <h2>Stripe</h2>
        <span>{diagnostic.lastStatus || "No events"}</span>
      </div>
      <div className="diagnostic-grid">
        <span>Configuration</span>
        <strong>{stripeConfigured ? "Configured" : "Not configured"}</strong>
        <span>Last Event</span>
        <strong>{formatMaybeDate(diagnostic.lastEventReceivedAt)}</strong>
        <span>Check-in</span>
        <strong>{formatMaybeDate(diagnostic.lastCheckInCreatedAt)}</strong>
        <span>Reservation</span>
        <strong>{diagnostic.lastReservationNumber || "-"}</strong>
        <span>Guest</span>
        <strong>{diagnostic.lastFullName || "-"}</strong>
        <span>Status</span>
        <strong className={diagnostic.lastError ? "error-text" : ""}>
          {diagnostic.lastStatus || "-"}
        </strong>
        <span>Error</span>
        <strong className={diagnostic.lastError ? "error-text" : ""}>
          {diagnostic.lastError || "No errors"}
        </strong>
      </div>
    </section>
  );
}
