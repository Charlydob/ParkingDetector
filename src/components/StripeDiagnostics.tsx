import type { StripeDiagnostic } from "../types/detection";

interface StripeDiagnosticsProps {
  diagnostic: StripeDiagnostic;
}

function formatMaybeDate(value?: string): string {
  if (!value) {
    return "-";
  }

  return new Intl.DateTimeFormat("es-ES", {
    dateStyle: "short",
    timeStyle: "medium",
  }).format(new Date(value));
}

export function StripeDiagnostics({ diagnostic }: StripeDiagnosticsProps) {
  return (
    <section className="panel stripe-panel">
      <div className="section-heading">
        <h2>Stripe</h2>
        <span>{diagnostic.lastStatus || "sin eventos"}</span>
      </div>
      <div className="diagnostic-grid">
        <span>Ultimo evento</span>
        <strong>{formatMaybeDate(diagnostic.lastEventReceivedAt)}</strong>
        <span>Check-in</span>
        <strong>{formatMaybeDate(diagnostic.lastCheckInCreatedAt)}</strong>
        <span>Reserva</span>
        <strong>{diagnostic.lastReservationNumber || "-"}</strong>
        <span>Huesped</span>
        <strong>{diagnostic.lastFullName || "-"}</strong>
        <span>Estado</span>
        <strong className={diagnostic.lastError ? "error-text" : ""}>
          {diagnostic.lastStatus || "-"}
        </strong>
        <span>Error</span>
        <strong className={diagnostic.lastError ? "error-text" : ""}>
          {diagnostic.lastError || "Sin errores"}
        </strong>
      </div>
    </section>
  );
}
