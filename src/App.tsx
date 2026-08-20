import { useEffect, useMemo, useState } from "react";
import { DetectionDetail } from "./components/DetectionDetail";
import {
  DetectionFilters,
  type DetectionFilter,
} from "./components/DetectionFilters";
import { DetectionList } from "./components/DetectionList";
import { DemoDetectionForm } from "./components/DemoDetectionForm";
import { Header } from "./components/Header";
import { ReservationDiagnostics } from "./components/ReservationDiagnostics";
import { StatsCards } from "./components/StatsCards";
import {
  listenToDetections,
  listenToFirebaseConnection,
  updateDetectionReviewStatus,
} from "./services/firebaseDetectionService";
import {
  getReservationSourceName,
  loadReservationsWithDiagnostics,
} from "./services/reservationService";
import type { Detection, ReviewStatus } from "./types/detection";
import type { ReservationLoadResult } from "./types/reservation";
import { normalizePlate } from "./utils/normalizePlate";

const initialDiagnostics: ReservationLoadResult = {
  reservations: [],
  source: getReservationSourceName(),
  updatedAt: new Date().toISOString(),
};

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

export default function App() {
  const [detections, setDetections] = useState<Detection[]>([]);
  const [selectedId, setSelectedId] = useState<string>();
  const [connected, setConnected] = useState(false);
  const [firebaseError, setFirebaseError] = useState("");
  const [notice, setNotice] = useState("");
  const [filter, setFilter] = useState<DetectionFilter>("all");
  const [search, setSearch] = useState("");
  const [diagnostics, setDiagnostics] = useState(initialDiagnostics);
  const [loadingReservations, setLoadingReservations] = useState(false);
  const [updatingReview, setUpdatingReview] = useState(false);

  useEffect(() => {
    const unsubscribeConnection = listenToFirebaseConnection(setConnected);
    const unsubscribeDetections = listenToDetections(
      setDetections,
      (error) => setFirebaseError(error.message),
    );

    return () => {
      unsubscribeConnection();
      unsubscribeDetections();
    };
  }, []);

  async function refreshReservations() {
    setLoadingReservations(true);
    const result = await loadReservationsWithDiagnostics();
    setDiagnostics(result);
    setLoadingReservations(false);
  }

  useEffect(() => {
    void refreshReservations();
  }, []);

  useEffect(() => {
    if (!selectedId && detections[0]) {
      setSelectedId(detections[0].id);
    }
  }, [detections, selectedId]);

  const selectedDetection = detections.find((detection) => detection.id === selectedId);
  const filteredDetections = useMemo(
    () => filterDetections(detections, filter, search),
    [detections, filter, search],
  );
  const pendingIncidents = detections.filter(
    (detection) =>
      detection.reviewStatus === "pending" &&
      (detection.parkingStatus !== "paid" || detection.associationStatus !== "matched"),
  ).length;

  async function handleReviewChange(
    detectionId: string,
    reviewStatus: ReviewStatus,
  ): Promise<void> {
    setUpdatingReview(true);
    try {
      await updateDetectionReviewStatus(detectionId, reviewStatus);
      setNotice("Revision actualizada.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "No se pudo actualizar la revision.");
    } finally {
      setUpdatingReview(false);
    }
  }

  return (
    <main className="app-shell">
      <Header
        connected={connected}
        source={diagnostics.source}
        pendingIncidents={pendingIncidents}
        onRefreshReservations={refreshReservations}
        refreshingReservations={loadingReservations}
      />

      {(notice || firebaseError) && (
        <div className={firebaseError ? "notice error" : "notice"}>
          {firebaseError || notice}
        </div>
      )}

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
            onSelect={(detection) => setSelectedId(detection.id)}
          />
        </div>
        <div className="side-column">
          <DemoDetectionForm
            onCreated={(detection) => {
              setSelectedId(detection.id);
              setNotice(`Deteccion ${detection.plate} guardada.`);
            }}
            onError={setNotice}
          />
          <DetectionDetail
            detection={selectedDetection}
            onReviewChange={handleReviewChange}
            updating={updatingReview}
          />
          <ReservationDiagnostics
            diagnostics={diagnostics}
            onRefresh={refreshReservations}
            loading={loadingReservations}
          />
        </div>
      </div>
    </main>
  );
}
