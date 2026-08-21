import { Check, Clock3, X } from "lucide-react";
import { useEffect, useState } from "react";
import { StatusBadge } from "./StatusBadge";
import type { AssociationCandidate, Detection, ReviewStatus } from "../types/detection";
import { evidenceUrlFromPath } from "../services/backendApi";

interface DetectionDetailProps {
  detection?: Detection;
  onReviewChange: (detectionId: string, reviewStatus: ReviewStatus) => Promise<void>;
  onConfirmCandidate: (
    detectionId: string,
    candidate: AssociationCandidate,
  ) => Promise<void>;
  onDelete: (detection: Detection) => Promise<void>;
  updating: boolean;
}

function formatDateTime(isoDate: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(isoDate));
}

export function DetectionDetail({
  detection,
  onReviewChange,
  onConfirmCandidate,
  onDelete,
  updating,
}: DetectionDetailProps) {
  const [snapshotFailed, setSnapshotFailed] = useState(false);
  const [videoFailed, setVideoFailed] = useState(false);

  useEffect(() => {
    setSnapshotFailed(false);
    setVideoFailed(false);
  }, [detection?.id]);

  if (!detection) {
    return (
      <aside className="panel detail-panel">
        <div className="section-heading">
          <h2>Detection Detail</h2>
        </div>
        <div className="empty-state">Select a detection</div>
      </aside>
    );
  }

  const reviewActions: Array<{
    value: ReviewStatus;
    label: string;
    icon: typeof Check;
  }> = [
    { value: "confirmed", label: "Confirm Incident", icon: Check },
    { value: "dismissed", label: "Dismiss", icon: X },
    { value: "pending", label: "Mark Pending", icon: Clock3 },
  ];
  const snapshotUrl = evidenceUrlFromPath(detection.localSnapshotPath) || detection.snapshotUrl;
  const videoUrl = evidenceUrlFromPath(detection.localVideoPath) || detection.videoUrl;
  const hasLocalEvidence = Boolean(detection.localSnapshotPath || detection.localVideoPath);

  return (
    <aside className="panel detail-panel">
      <div className="section-heading">
        <h2>Detection Detail</h2>
        <span>{detection.plate}</span>
      </div>

      {snapshotUrl && !snapshotFailed ? (
        <img
          className="snapshot"
          src={snapshotUrl}
          alt={`Snapshot ${detection.plate}`}
          onError={() => setSnapshotFailed(true)}
        />
      ) : (
        <div className="snapshot placeholder">
          {hasLocalEvidence ? "Evidence file not available" : "No snapshot available"}
        </div>
      )}

      {videoUrl && !videoFailed ? (
        <video
          className="video-preview"
          src={videoUrl}
          controls
          preload="metadata"
          onError={() => setVideoFailed(true)}
        />
      ) : (
        hasLocalEvidence && (
          <div className="video-preview placeholder">
            Evidence file not available
          </div>
        )
      )}

      {hasLocalEvidence && (
        <div className="local-evidence-note">Local evidence stored on the hotel server</div>
      )}

      <dl className="detail-grid">
        <div>
          <dt>Date</dt>
          <dd>{formatDateTime(detection.detectedAt)}</dd>
        </div>
        <div>
          <dt>Camera</dt>
          <dd>{detection.camera}</dd>
        </div>
        <div>
          <dt>Reservation</dt>
          <dd>{detection.reservationCode || "-"}</dd>
        </div>
        <div>
          <dt>Room</dt>
          <dd>{detection.room || "-"}</dd>
        </div>
        <div>
          <dt>Guest</dt>
          <dd>{detection.guestName || "-"}</dd>
        </div>
        <div>
          <dt>Email</dt>
          <dd>{detection.guestEmail || "-"}</dd>
        </div>
        <div>
          <dt>Check-in</dt>
          <dd>{detection.checkInAt ? formatDateTime(detection.checkInAt) : "-"}</dd>
        </div>
        <div>
          <dt>Method</dt>
          <dd>{detection.associationMethod || "-"}</dd>
        </div>
        <div>
          <dt>Confidence</dt>
          <dd>
            {detection.confidence !== undefined
              ? `${Math.round(detection.confidence * 100)} %`
              : "-"}
          </dd>
        </div>
        <div>
          <dt>Difference</dt>
          <dd>
            {detection.timeDifferenceMinutes !== undefined
              ? `${Math.round(detection.timeDifferenceMinutes)} min`
              : "-"}
          </dd>
        </div>
        <div>
          <dt>Parking</dt>
          <dd>
            <StatusBadge value={detection.parkingStatus} tone={detection.parkingStatus} />
          </dd>
        </div>
        <div>
          <dt>Association</dt>
          <dd>
            <StatusBadge
              value={detection.associationStatus}
              tone={detection.associationStatus}
            />
          </dd>
        </div>
      </dl>

      {detection.associationStatus === "ambiguous" &&
        detection.associationCandidates &&
        detection.associationCandidates.length > 0 && (
          <div className="candidate-list">
            <h3>Candidates</h3>
            {detection.associationCandidates.map((candidate) => (
              <div
                key={`${candidate.reservationCode}-${candidate.checkInAt}`}
                className="candidate-item"
              >
                <div>
                  <strong>{candidate.fullName}</strong>
                  <span>
                    {candidate.reservationCode} - Room {candidate.room || "-"} -{" "}
                    {Math.round(candidate.confidence * 100)} % -{" "}
                    {Math.round(candidate.timeDifferenceMinutes)} min
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => onConfirmCandidate(detection.id, candidate)}
                  disabled={updating}
                >
                  <Check size={15} />
                  Select
                </button>
              </div>
            ))}
          </div>
        )}

      <div className="review-actions">
        {reviewActions.map(({ value, label, icon: Icon }) => (
          <button
            key={value}
            type="button"
            className={detection.reviewStatus === value ? "active" : ""}
            onClick={() => onReviewChange(detection.id, value)}
            disabled={updating}
          >
            <Icon size={16} />
            {label}
          </button>
        ))}
        <button
          type="button"
          className="danger"
          onClick={() => onDelete(detection)}
          disabled={updating}
        >
          <X size={16} />
          Delete Detection
        </button>
      </div>
    </aside>
  );
}
