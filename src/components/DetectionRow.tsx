import { Camera, Image } from "lucide-react";
import { StatusBadge } from "./StatusBadge";
import type { Detection } from "../types/detection";
import { evidenceUrlFromPath } from "../services/backendApi";

interface DetectionRowProps {
  detection: Detection;
  selected: boolean;
  onSelect: (detection: Detection) => void;
}

function formatTime(isoDate: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    day: "2-digit",
    month: "2-digit",
  }).format(new Date(isoDate));
}

function formatConfidence(confidence?: number): string {
  if (confidence === undefined) {
    return "";
  }

  return `${Math.round(confidence * 100)} %`;
}

function associationSummary(detection: Detection): string {
  if (detection.associationStatus === "ambiguous") {
    return `Ambiguous · ${detection.associationCandidates?.length ?? 0}`;
  }

  if (detection.associationMethod === "plate") {
    return "Plate";
  }

  if (detection.associationMethod === "temporal") {
    return "Temporal";
  }

  return detection.associationStatus;
}

export function DetectionRow({ detection, selected, onSelect }: DetectionRowProps) {
  const snapshotUrl = evidenceUrlFromPath(detection.localSnapshotPath) || detection.snapshotUrl;

  return (
    <button
      className={selected ? "detection-row selected" : "detection-row"}
      type="button"
      onClick={() => onSelect(detection)}
    >
      <span className="thumb-cell">
        {snapshotUrl ? (
          <img src={snapshotUrl} alt="" loading="lazy" />
        ) : (
          <Image size={15} />
        )}
      </span>
      <span className="plate-cell">{detection.plate}</span>
      <span className="meta-cell">{formatTime(detection.detectedAt)}</span>
      <span className="camera-cell">
        <Camera size={14} />
        {detection.camera}
      </span>
      <span className="meta-cell">{detection.room || "-"}</span>
      <span className="guest-cell">{detection.guestName || "-"}</span>
      <StatusBadge value={detection.parkingStatus} tone={detection.parkingStatus} />
      <span className="association-cell">
        <StatusBadge
          value={associationSummary(detection)}
          tone={detection.associationStatus}
        />
      </span>
      <span className="meta-cell">{formatConfidence(detection.confidence) || "-"}</span>
      <span className={`review-pill ${detection.reviewStatus}`}>
        {detection.reviewStatus.toUpperCase()}
      </span>
    </button>
  );
}
