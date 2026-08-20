import { Camera, Image } from "lucide-react";
import { StatusBadge } from "./StatusBadge";
import type { Detection } from "../types/detection";

interface DetectionRowProps {
  detection: Detection;
  selected: boolean;
  onSelect: (detection: Detection) => void;
}

function formatTime(isoDate: string): string {
  return new Intl.DateTimeFormat("es-ES", {
    hour: "2-digit",
    minute: "2-digit",
    day: "2-digit",
    month: "2-digit",
  }).format(new Date(isoDate));
}

export function DetectionRow({ detection, selected, onSelect }: DetectionRowProps) {
  return (
    <button
      className={selected ? "detection-row selected" : "detection-row"}
      type="button"
      onClick={() => onSelect(detection)}
    >
      <span className="plate-cell">{detection.plate}</span>
      <span className="meta-cell">{formatTime(detection.detectedAt)}</span>
      <span className="camera-cell">
        <Camera size={14} />
        {detection.camera}
      </span>
      <span className="meta-cell">{detection.room || "-"}</span>
      <span className="guest-cell">{detection.guestName || "-"}</span>
      <span className="meta-cell">{detection.reservationCode || "-"}</span>
      <StatusBadge value={detection.parkingStatus} tone={detection.parkingStatus} />
      <StatusBadge value={detection.associationStatus} tone={detection.associationStatus} />
      <span className={`review-pill ${detection.reviewStatus}`}>
        {detection.reviewStatus.toUpperCase()}
      </span>
      <span className="media-indicator" title={detection.snapshotUrl ? "Snapshot" : "Sin snapshot"}>
        <Image size={15} />
      </span>
    </button>
  );
}
