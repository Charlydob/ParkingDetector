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
        <h2>Recent Detections</h2>
        <span>{detections.length}</span>
      </div>
      <div className="detection-table">
        <div className="table-head">
          <span></span>
          <span>License Plate</span>
          <span>Time</span>
          <span>Camera</span>
          <span>Room</span>
          <span>Guest</span>
          <span>Parking</span>
          <span>Association</span>
          <span>Confidence</span>
          <span>Review</span>
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
            <div className="empty-state">No detections yet</div>
          )}
        </div>
      </div>
    </section>
  );
}
