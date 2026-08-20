import { AlertTriangle, CalendarClock, CheckCircle2, Clock3, HelpCircle } from "lucide-react";
import type { Detection } from "../types/detection";

interface StatsCardsProps {
  detections: Detection[];
}

function isToday(isoDate: string): boolean {
  const date = new Date(isoDate);
  const now = new Date();

  return (
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate()
  );
}

export function StatsCards({ detections }: StatsCardsProps) {
  const stats = {
    today: detections.filter((detection) => isToday(detection.detectedAt)).length,
    paid: detections.filter((detection) => detection.parkingStatus === "paid").length,
    unpaid: detections.filter((detection) => detection.parkingStatus === "unpaid").length,
    unknown: detections.filter((detection) => detection.parkingStatus === "unknown").length,
    pending: detections.filter((detection) => detection.reviewStatus === "pending").length,
  };

  return (
    <section className="stats-grid" aria-label="Estadisticas">
      <article className="stat-item">
        <CalendarClock size={18} />
        <span>Hoy</span>
        <strong>{stats.today}</strong>
      </article>
      <article className="stat-item paid">
        <CheckCircle2 size={18} />
        <span>Valido</span>
        <strong>{stats.paid}</strong>
      </article>
      <article className="stat-item unpaid">
        <AlertTriangle size={18} />
        <span>No pagado</span>
        <strong>{stats.unpaid}</strong>
      </article>
      <article className="stat-item unknown">
        <HelpCircle size={18} />
        <span>Desconocido</span>
        <strong>{stats.unknown}</strong>
      </article>
      <article className="stat-item pending">
        <Clock3 size={18} />
        <span>Pendiente</span>
        <strong>{stats.pending}</strong>
      </article>
    </section>
  );
}
