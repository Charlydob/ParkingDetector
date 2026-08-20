import { DetectionRow } from "./DetectionRow";
import type { Detection } from "../types/detection";

interface DetectionListProps {
  detections: Detection[];
  selectedId?: string;
  onSelect: (detection: Detection) => void;
}

export function DetectionList({ detections, selectedId, onSelect }: DetectionListProps) {
  return (
    <section className="panel detections-panel">
      <div className="section-heading">
        <h2>Detecciones</h2>
        <span>{detections.length}</span>
      </div>
      <div className="detection-table">
        <div className="table-head">
          <span>Matricula</span>
          <span>Hora</span>
          <span>Camara</span>
          <span>Hab.</span>
          <span>Huesped</span>
          <span>Reserva</span>
          <span>Parking</span>
          <span>Asoc.</span>
          <span>Revision</span>
          <span></span>
        </div>
        <div className="table-body">
          {detections.length > 0 ? (
            detections.map((detection) => (
              <DetectionRow
                key={detection.id}
                detection={detection}
                selected={detection.id === selectedId}
                onSelect={onSelect}
              />
            ))
          ) : (
            <div className="empty-state">Sin detecciones</div>
          )}
        </div>
      </div>
    </section>
  );
}
