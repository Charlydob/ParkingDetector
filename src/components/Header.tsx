import { RefreshCw } from "lucide-react";

interface HeaderProps {
  onRefreshReservations: () => void;
  refreshingReservations: boolean;
  activeView: "dashboard" | "system" | "settings";
  onViewChange: (view: "dashboard" | "system" | "settings") => void;
}

export function Header({
  onRefreshReservations,
  refreshingReservations,
  activeView,
  onViewChange,
}: HeaderProps) {
  return (
    <header className="app-header">
      <div>
        <h1>Parking Detector</h1>
      </div>
      <div className="header-actions">
        <div className="segmented-control compact" role="tablist" aria-label="Main view">
          <button
            type="button"
            className={activeView === "dashboard" ? "active" : ""}
            onClick={() => onViewChange("dashboard")}
          >
            Dashboard
          </button>
          <button
            type="button"
            className={activeView === "system" ? "active" : ""}
            onClick={() => onViewChange("system")}
          >
            System
          </button>
          <button
            type="button"
            className={activeView === "settings" ? "active" : ""}
            onClick={() => onViewChange("settings")}
          >
            Settings
          </button>
        </div>
        <button
          className="icon-button"
          type="button"
          onClick={onRefreshReservations}
          title="Refresh reservations"
          aria-label="Refresh reservations"
          disabled={refreshingReservations}
        >
          <RefreshCw size={18} className={refreshingReservations ? "spinning" : ""} />
        </button>
      </div>
    </header>
  );
}
