import { Circle, Database, RefreshCw } from "lucide-react";
import type { ReservationSourceName } from "../types/reservation";

interface HeaderProps {
  connected: boolean;
  source: ReservationSourceName;
  pendingIncidents: number;
  onRefreshReservations: () => void;
  refreshingReservations: boolean;
}

export function Header({
  connected,
  source,
  pendingIncidents,
  onRefreshReservations,
  refreshingReservations,
}: HeaderProps) {
  return (
    <header className="app-header">
      <div>
        <h1>Parking Detector</h1>
        <div className="status-strip">
          <span className={connected ? "dot-label online" : "dot-label offline"}>
            <Circle size={10} fill="currentColor" />
            Firebase {connected ? "conectado" : "desconectado"}
          </span>
          <span className="dot-label neutral">
            <Database size={14} />
            Reservas: {source}
          </span>
          <span className="dot-label alert">{pendingIncidents} pendientes</span>
        </div>
      </div>
      <button
        className="icon-button"
        type="button"
        onClick={onRefreshReservations}
        title="Actualizar reservas"
        aria-label="Actualizar reservas"
        disabled={refreshingReservations}
      >
        <RefreshCw size={18} className={refreshingReservations ? "spinning" : ""} />
      </button>
    </header>
  );
}
