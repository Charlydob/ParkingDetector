import { Check, Clock3, X } from "lucide-react";
import { StatusBadge } from "./StatusBadge";
import type { AssociationCandidate, Detection, ReviewStatus } from "../types/detection";

interface DetectionDetailProps {
  detection?: Detection;
  onReviewChange: (detectionId: string, reviewStatus: ReviewStatus) => Promise<void>;
  onConfirmCandidate: (
    detectionId: string,
    candidate: AssociationCandidate,
  ) => Promise<void>;
  updating: boolean;
}

function formatDateTime(isoDate: string): string {
  return new Intl.DateTimeFormat("es-ES", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(isoDate));
}

export function DetectionDetail({
  detection,
  onReviewChange,
  onConfirmCandidate,
  updating,
}: DetectionDetailProps) {
  if (!detection) {
    return (
      <aside className="panel detail-panel">
        <div className="section-heading">
          <h2>Detalle</h2>
        </div>
        <div className="empty-state">Selecciona una deteccion</div>
      </aside>
    );
  }

  const reviewActions: Array<{
    value: ReviewStatus;
    label: string;
    icon: typeof Check;
  }> = [
    { value: "confirmed", label: "Confirmar incidencia", icon: Check },
    { value: "dismissed", label: "Descartar", icon: X },
    { value: "pending", label: "Marcar pendiente", icon: Clock3 },
  ];

  return (
    <aside className="panel detail-panel">
      <div className="section-heading">
        <h2>Detalle</h2>
        <span>{detection.plate}</span>
      </div>

      {detection.snapshotUrl ? (
        <img className="snapshot" src={detection.snapshotUrl} alt={`Snapshot ${detection.plate}`} />
      ) : (
        <div className="snapshot placeholder">Sin snapshot</div>
      )}

      {detection.videoUrl && (
        <video className="video-preview" src={detection.videoUrl} controls preload="metadata" />
      )}

      <dl className="detail-grid">
        <div>
          <dt>Fecha</dt>
          <dd>{formatDateTime(detection.detectedAt)}</dd>
        </div>
        <div>
          <dt>Camara</dt>
          <dd>{detection.camera}</dd>
        </div>
        <div>
          <dt>Reserva</dt>
          <dd>{detection.reservationCode || "-"}</dd>
        </div>
        <div>
          <dt>Habitacion</dt>
          <dd>{detection.room || "-"}</dd>
        </div>
        <div>
          <dt>Huesped</dt>
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
          <dt>Metodo</dt>
          <dd>{detection.associationMethod || "-"}</dd>
        </div>
        <div>
          <dt>Confianza</dt>
          <dd>
            {detection.confidence !== undefined
              ? `${Math.round(detection.confidence * 100)} %`
              : "-"}
          </dd>
        </div>
        <div>
          <dt>Diferencia</dt>
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
          <dt>Asociacion</dt>
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
            <h3>Candidatos</h3>
            {detection.associationCandidates.map((candidate) => (
              <div
                key={`${candidate.reservationCode}-${candidate.checkInAt}`}
                className="candidate-item"
              >
                <div>
                  <strong>{candidate.fullName}</strong>
                  <span>
                    {candidate.reservationCode} - Hab. {candidate.room || "-"} -{" "}
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
                  Seleccionar
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
      </div>
    </aside>
  );
}
