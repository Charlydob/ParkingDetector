import { useEffect, useMemo, useState } from "react";
import { CheckInDemoPage } from "./components/CheckInDemoPage";
import { DetectionDetail } from "./components/DetectionDetail";
import {
  DetectionFilters,
  type DetectionFilter,
} from "./components/DetectionFilters";
import { DetectionList } from "./components/DetectionList";
import { Header } from "./components/Header";
import { IntegrationsOverview } from "./components/IntegrationsOverview";
import { ReservationDiagnostics } from "./components/ReservationDiagnostics";
import { SettingsIntegrations } from "./components/SettingsIntegrations";
import { StatsCards } from "./components/StatsCards";
import { StripeDiagnostics } from "./components/StripeDiagnostics";
import { TestingTools } from "./components/TestingTools";
import {
  deleteDetectionPermanently,
  getBackendStatus,
  getIntegrationSettings,
  type BackendStatus,
  type IntegrationSettings,
} from "./services/backendApi";
import { getBackendUrl } from "./services/backendConfigService";
import {
  confirmTemporalAssociation,
  listenToDetections,
  listenToFirebaseConnection,
  listenToStripeDiagnostic,
  updateDetectionReviewStatus,
} from "./services/firebaseDetectionService";
import {
  getReservationSourceName,
  refreshReservationsWithDiagnostics,
} from "./services/reservationService";
import type {
  AssociationCandidate,
  Detection,
  ReviewStatus,
  StripeDiagnostic,
} from "./types/detection";
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

function ParkingDetectorApp() {
  const [detections, setDetections] = useState<Detection[]>([]);
  const [selectedId, setSelectedId] = useState<string>();
  const [selectionTouched, setSelectionTouched] = useState(false);
  const [connected, setConnected] = useState(false);
  const [firebaseError, setFirebaseError] = useState("");
  const [notice, setNotice] = useState("");
  const [filter, setFilter] = useState<DetectionFilter>("all");
  const [search, setSearch] = useState("");
  const [diagnostics, setDiagnostics] = useState(initialDiagnostics);
  const [stripeDiagnostic, setStripeDiagnostic] = useState<StripeDiagnostic>({});
  const [loadingReservations, setLoadingReservations] = useState(false);
  const [updatingReview, setUpdatingReview] = useState(false);
  const [activeView, setActiveView] = useState<"dashboard" | "system" | "settings">("dashboard");
  const [backendStatus, setBackendStatus] = useState<BackendStatus>();
  const [integrationSettings, setIntegrationSettings] = useState<IntegrationSettings>();
  const [backendUrl, setActiveBackendUrl] = useState(getBackendUrl());

  useEffect(() => {
    const unsubscribeConnection = listenToFirebaseConnection(setConnected);
    const unsubscribeDetections = listenToDetections(
      setDetections,
      (error) => setFirebaseError(error.message),
    );
    const unsubscribeStripe = listenToStripeDiagnostic(
      setStripeDiagnostic,
      (error) => setFirebaseError(error.message),
    );

    return () => {
      unsubscribeConnection();
      unsubscribeDetections();
      unsubscribeStripe();
    };
  }, []);

  async function refreshReservations() {
    setLoadingReservations(true);
    const result = await refreshReservationsWithDiagnostics();
    setDiagnostics(result);
    setLoadingReservations(false);
  }

  async function refreshBackendState() {
    try {
      const status = await getBackendStatus();
      setBackendStatus(status);
    } catch {
      setBackendStatus(undefined);
    }

    try {
      setIntegrationSettings(await getIntegrationSettings());
    } catch {
      setIntegrationSettings(undefined);
    }
  }

  async function handleBackendUrlChange(url: string) {
    setActiveBackendUrl(url);
    await refreshBackendState();
    await refreshReservations();
  }

  useEffect(() => {
    void refreshReservations();
    void refreshBackendState();

    const intervalId = window.setInterval(() => {
      void refreshBackendState();
    }, 10000);

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
      await updateDetectionReviewStatus(detectionId, reviewStatus);
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
      await confirmTemporalAssociation(detectionId, candidate);
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
      setDetections((current) => current.filter((item) => item.id !== detection.id));
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
    <main className="app-shell">
      <Header
        onRefreshReservations={refreshReservations}
        refreshingReservations={loadingReservations}
        activeView={activeView}
        onViewChange={setActiveView}
      />

      {(notice || firebaseError) && (
        <div className={firebaseError ? "notice error" : "notice"}>
          {firebaseError || notice}
        </div>
      )}

      {activeView === "dashboard" ? (
        <>
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
        </>
      ) : activeView === "system" ? (
        <section className="system-grid">
          <IntegrationsOverview
            backendStatus={backendStatus}
            firebaseConnected={connected}
          />
          <ReservationDiagnostics
            diagnostics={diagnostics}
            backendStatus={backendStatus}
            onRefresh={async () => {
              await refreshReservations();
              await refreshBackendState();
            }}
            loading={loadingReservations}
          />
          <StripeDiagnostics
            diagnostic={stripeDiagnostic}
            stripeConfigured={backendStatus?.stripeConfigured}
          />
          <TestingTools
            onDetectionCreated={(detection) => {
              setSelectionTouched(true);
              setSelectedId(detection.id);
              setNotice(`Detection ${detection.plate} saved.`);
            }}
            onNotice={setNotice}
          />
        </section>
      ) : (
        <SettingsIntegrations
          settings={integrationSettings}
          backendStatus={backendStatus}
          backendUrl={backendUrl}
          onBackendUrlChange={handleBackendUrlChange}
          onSettingsChange={setIntegrationSettings}
          onNotice={setNotice}
          onRefreshReservations={async () => {
            await refreshReservations();
            await refreshBackendState();
          }}
        />
      )}
    </main>
  );
}

export default function App() {
  return window.location.pathname === "/checkin-demo" ? (
    <CheckInDemoPage />
  ) : (
    <ParkingDetectorApp />
  );
}
