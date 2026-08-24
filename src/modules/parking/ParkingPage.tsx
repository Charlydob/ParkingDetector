import { useEffect, useMemo, useState } from "react";
import { DetectionDetail } from "../../components/DetectionDetail";
import {
  DetectionFilters,
  type DetectionFilter,
} from "../../components/DetectionFilters";
import { DetectionList } from "../../components/DetectionList";
import { StatsCards } from "../../components/StatsCards";
import {
  confirmBackendTemporalAssociation,
  deleteDetectionPermanently,
  getParkingDetections,
  updateBackendDetectionReviewStatus,
} from "../../services/backendApi";
import type {
  AssociationCandidate,
  Detection,
  ReviewStatus,
} from "../../types/detection";
import { normalizePlate } from "../../utils/normalizePlate";

function filterDetections(
  detections: Detection[],
  filter: DetectionFilter,
  search: string,
): Detection[] {
  const normalizedSearch = normalizePlate(search);
  const textSearch = search.trim().toLowerCase();

  return detections.filter((detection) => {
    const matchesFilter =
      filter === "all" ||
      (filter === "pending" && detection.reviewStatus === "pending") ||
      (filter === "incidents" &&
        (detection.parkingStatus === "unpaid" ||
          detection.parkingStatus === "unknown" ||
          detection.associationStatus !== "matched")) ||
      (filter === "paid" && detection.parkingStatus === "paid");

    if (!matchesFilter) {
      return false;
    }

    if (!search.trim()) {
      return true;
    }

    return (
      detection.plate.includes(normalizedSearch) ||
      detection.room?.toLowerCase().includes(textSearch) ||
      detection.guestName?.toLowerCase().includes(textSearch) ||
      detection.reservationCode?.toLowerCase().includes(textSearch)
    );
  });
}

export function ParkingPage() {
  const [detections, setDetections] = useState<Detection[]>([]);
  const [selectedId, setSelectedId] = useState<string>();
  const [selectionTouched, setSelectionTouched] = useState(false);
  const [notice, setNotice] = useState("");
  const [filter, setFilter] = useState<DetectionFilter>("all");
  const [search, setSearch] = useState("");
  const [updatingReview, setUpdatingReview] = useState(false);

  async function reloadDetections() {
    setDetections(await getParkingDetections());
  }

  useEffect(() => {
    void reloadDetections().catch((error) =>
      setNotice(error instanceof Error ? error.message : "Could not load detections."),
    );
    const intervalId = window.setInterval(() => {
      void reloadDetections().catch(() => undefined);
    }, 5000);

    return () => window.clearInterval(intervalId);
  }, []);

  useEffect(() => {
    if (!selectionTouched && !selectedId && detections[0]) {
      setSelectedId(detections[0].id);
    }

    if (selectedId && !detections.some((detection) => detection.id === selectedId)) {
      setSelectedId(undefined);
    }
  }, [detections, selectedId, selectionTouched]);

  const selectedDetection = detections.find((detection) => detection.id === selectedId);
  const filteredDetections = useMemo(
    () => filterDetections(detections, filter, search),
    [detections, filter, search],
  );

  async function handleReviewChange(
    detectionId: string,
    reviewStatus: ReviewStatus,
  ): Promise<void> {
    setUpdatingReview(true);
    try {
      await updateBackendDetectionReviewStatus(detectionId, reviewStatus);
      await reloadDetections();
      setNotice("Review status updated.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not update review status.");
    } finally {
      setUpdatingReview(false);
    }
  }

  async function handleConfirmCandidate(
    detectionId: string,
    candidate: AssociationCandidate,
  ): Promise<void> {
    setUpdatingReview(true);
    try {
      await confirmBackendTemporalAssociation(detectionId, candidate);
      await reloadDetections();
      setNotice("Temporal association confirmed.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not confirm the association.");
    } finally {
      setUpdatingReview(false);
    }
  }

  async function handleDeleteDetection(detection: Detection): Promise<void> {
    if (!window.confirm("Delete this detection permanently?")) {
      return;
    }

    setUpdatingReview(true);
    try {
      const result = await deleteDetectionPermanently(detection.id);
      if (!result.success) {
        throw new Error("Backend did not confirm deletion.");
      }
      await reloadDetections();
      setSelectionTouched(true);
      setSelectedId(undefined);
      setNotice(`Detection ${detection.plate} deleted.`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not delete the detection.");
    } finally {
      setUpdatingReview(false);
    }
  }

  return (
    <section className="module-page">
      <div className="module-title">
        <div>
          <h1>Parking</h1>
          <p>ANPR detections, reservation matching, review and evidence.</p>
        </div>
        <button type="button" onClick={reloadDetections}>
          Refresh
        </button>
      </div>

      {notice && <div className={notice.includes("Could not") ? "notice error" : "notice"}>{notice}</div>}

      <StatsCards detections={detections} />

      <div className="workspace-grid">
        <div className="main-column">
          <DetectionFilters
            filter={filter}
            search={search}
            onFilterChange={setFilter}
            onSearchChange={setSearch}
          />
          <DetectionList
            detections={filteredDetections}
            selectedId={selectedId}
            onSelect={(detection) => {
              setSelectionTouched(true);
              setSelectedId(detection.id);
            }}
          />
        </div>
        <div className="detail-column">
          <DetectionDetail
            detection={selectedDetection}
            onReviewChange={handleReviewChange}
            onConfirmCandidate={handleConfirmCandidate}
            onDelete={handleDeleteDetection}
            updating={updatingReview}
          />
        </div>
      </div>
    </section>
  );
}
