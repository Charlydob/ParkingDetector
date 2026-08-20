import { RefreshCw } from "lucide-react";
import type { ReservationLoadResult } from "../types/reservation";

interface ReservationDiagnosticsProps {
  diagnostics: ReservationLoadResult;
  onRefresh: () => void;
  loading: boolean;
}

function formatUpdatedAt(value: string): string {
  return new Intl.DateTimeFormat("es-ES", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(new Date(value));
}

export function ReservationDiagnostics({
  diagnostics,
  onRefresh,
  loading,
}: ReservationDiagnosticsProps) {
  return (
    <section className="panel reservation-panel">
      <div className="section-heading">
        <h2>Fuente de reservas</h2>
        <button
          className="icon-button small"
          type="button"
          onClick={onRefresh}
          title="Actualizar reservas"
          aria-label="Actualizar reservas"
          disabled={loading}
        >
          <RefreshCw size={16} className={loading ? "spinning" : ""} />
        </button>
      </div>
      <div className="diagnostic-grid">
        <span>Fuente</span>
        <strong>{diagnostics.source}</strong>
        <span>Reservas</span>
        <strong>{diagnostics.reservations.length}</strong>
        <span>Actualizado</span>
        <strong>{formatUpdatedAt(diagnostics.updatedAt)}</strong>
        <span>Errores</span>
        <strong className={diagnostics.error ? "error-text" : ""}>
          {diagnostics.error || "Sin errores"}
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
