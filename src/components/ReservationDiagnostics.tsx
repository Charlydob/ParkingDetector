import { RefreshCw } from "lucide-react";
import type { BackendStatus } from "../services/backendApi";
import type { ReservationLoadResult } from "../types/reservation";

interface ReservationDiagnosticsProps {
  diagnostics: ReservationLoadResult;
  backendStatus?: BackendStatus;
  onRefresh: () => void;
  loading: boolean;
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

function formatSource(source?: string): string {
  if (source === "googleSheets") {
    return "Google Sheets";
  }

  if (source === "json") {
    return "JSON URL / API";
  }

  if (source === "reservationWebhook") {
    return "Reservation Webhook";
  }

  return "Demo";
}

export function ReservationDiagnostics({
  diagnostics,
  backendStatus,
  onRefresh,
  loading,
}: ReservationDiagnosticsProps) {
  const source = backendStatus?.reservationSource ?? diagnostics.source;
  const loaded = backendStatus?.reservationsLoaded ?? diagnostics.reservations.length;
  const updatedAt = backendStatus?.lastReservationRefreshAt ?? diagnostics.updatedAt;
  const error = backendStatus?.reservationLoadError ?? diagnostics.error;

  return (
    <section className="panel reservation-panel">
      <div className="section-heading">
        <h2>Reservation Source</h2>
        <button
          className="icon-button small"
          type="button"
          onClick={onRefresh}
          title="Refresh reservations"
          aria-label="Refresh reservations"
          disabled={loading}
        >
          <RefreshCw size={16} className={loading ? "spinning" : ""} />
        </button>
      </div>
      <div className="diagnostic-grid">
        <span>Source</span>
        <strong>{formatSource(source)}</strong>
        <span>Reservations</span>
        <strong>{loaded}</strong>
        <span>Updated</span>
        <strong>{formatDate(updatedAt)}</strong>
        <span>Errors</span>
        <strong className={error ? "error-text" : ""}>
          {error || "No errors"}
        </strong>
      </div>
      <div className="reservation-list">
        {diagnostics.reservations.slice(0, 5).map((reservation) => (
          <div key={`${reservation.reservationCode}-${reservation.plate}`}>
            <strong>{reservation.plate}</strong>
            <span>{reservation.name}</span>
            <span>{reservation.parkingValid ? "PAID" : "UNPAID"}</span>
            <span>{reservation.room}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
