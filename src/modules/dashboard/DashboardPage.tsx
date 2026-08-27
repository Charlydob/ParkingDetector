import {
  Bed,
  Bell,
  BellOff,
  CheckCircle2,
  Clock,
  Copy,
  Plus,
  RefreshCw,
  Send,
  Sparkles,
  UserCheck,
  UserPlus,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "../../auth/AuthContext";
import {
  generateTelegramStaffPairingCode,
  getBackendStatus,
  getCheckoutOverview,
  getHousekeepingBoard,
  getHousekeepingStaff,
  getParkingDetections,
  getPushStatus,
  manualHousekeepingCheckout,
  performHousekeepingAction,
  schedulePushTest,
  sendPushTest,
  updatePushPreferences,
} from "../../services/backendApi";
import type {
  BackendStatus,
  HousekeepingBoard,
  HousekeepingRoomItem,
  HousekeepingStaffMember,
  PushPreference,
  PushStatus,
} from "../../services/backendApi";
import {
  activatePushDevice,
  appIsStandalone,
  browserSupportsWebPush,
  deactivatePushDevice,
  getCurrentBrowserSubscription,
  shouldShowIosInstallHint,
  updateAppBadge,
} from "../../services/pushClient";
import type { CheckoutOverview } from "../../types/checkout";
import type { ModuleId, TenantRole } from "../../types/modules";
import type { Detection } from "../../types/detection";

type HousekeepingAction = "claim" | "bed_done" | "cleaning_done" | "complete" | "assign";
type PermissionState = NotificationPermission | "unsupported";

function isToday(value?: string | null): boolean {
  if (!value) {
    return false;
  }

  const date = new Date(value);
  const today = new Date();
  return (
    date.getFullYear() === today.getFullYear() &&
    date.getMonth() === today.getMonth() &&
    date.getDate() === today.getDate()
  );
}

function roleCanUseHousekeeping(role?: TenantRole | "platform_admin"): boolean {
  return ["platform_admin", "tenant_admin", "manager", "staff"].includes(role || "");
}

function roleCanManageHousekeeping(role?: TenantRole | "platform_admin"): boolean {
  return ["platform_admin", "tenant_admin", "manager"].includes(role || "");
}

function roomProgressLabel(room: HousekeepingRoomItem) {
  const bed = room.housekeeping.bedDoneAt ? "🛏✅" : "🛏☐";
  const cleaning = room.housekeeping.cleaningDoneAt ? "🧹✅" : "🧹☐";
  return `${bed} · ${cleaning}`;
}

function roomAssignee(room: HousekeepingRoomItem) {
  return room.housekeeping.assignedTo?.displayName || "Sin asignar";
}

function permissionState(): PermissionState {
  return "Notification" in window ? Notification.permission : "unsupported";
}

function selectedRoomFromBoard(board: HousekeepingBoard, current?: HousekeepingRoomItem) {
  const queryRoom = new URLSearchParams(window.location.search).get("housekeepingRoom");
  const needle = queryRoom || current?.roomNumber || current?.roomId || "";

  if (!needle) {
    return undefined;
  }

  return [...board.items, ...board.done].find(
    (item) => item.roomNumber === needle || item.roomId === needle || item.eventId === current?.eventId,
  );
}

export function DashboardPage({ enabledModules }: { enabledModules: Record<ModuleId, boolean> }) {
  const { user, session, activeTenantId } = useAuth();
  const [status, setStatus] = useState<BackendStatus>();
  const [checkout, setCheckout] = useState<CheckoutOverview>();
  const [detections, setDetections] = useState<Detection[]>([]);
  const [telegramPairing, setTelegramPairing] = useState<
    Awaited<ReturnType<typeof generateTelegramStaffPairingCode>> | undefined
  >();
  const [telegramBusy, setTelegramBusy] = useState(false);
  const [telegramNotice, setTelegramNotice] = useState("");
  const [pushStatus, setPushStatus] = useState<PushStatus>();
  const [pushPermission, setPushPermission] = useState<PermissionState>(permissionState);
  const [currentSubscription, setCurrentSubscription] = useState<PushSubscription | null>(null);
  const [pushBusy, setPushBusy] = useState("");
  const [pushNotice, setPushNotice] = useState("");
  const [testDelay, setTestDelay] = useState(20);
  const [board, setBoard] = useState<HousekeepingBoard>();
  const [staff, setStaff] = useState<HousekeepingStaffMember[]>([]);
  const [selectedRoom, setSelectedRoom] = useState<HousekeepingRoomItem>();
  const [housekeepingBusy, setHousekeepingBusy] = useState("");
  const [housekeepingNotice, setHousekeepingNotice] = useState("");
  const [assignmentTargetUserId, setAssignmentTargetUserId] = useState("");
  const [manualOpen, setManualOpen] = useState(false);
  const [manualRoomId, setManualRoomId] = useState("");
  const [manualAssigneeUserId, setManualAssigneeUserId] = useState("");

  const activeTenantRole = useMemo(
    () =>
      session?.memberships.find((membership) => membership.tenantId === activeTenantId)?.role ||
      (session?.isPlatformAdmin && activeTenantId ? "platform_admin" : undefined),
    [activeTenantId, session?.isPlatformAdmin, session?.memberships],
  );
  const canUseHousekeeping =
    enabledModules.checkout && roleCanUseHousekeeping(activeTenantRole);
  const canManageHousekeeping = roleCanManageHousekeeping(activeTenantRole);

  const refreshPush = useCallback(async () => {
    setPushPermission(permissionState());

    if (!browserSupportsWebPush()) {
      setCurrentSubscription(null);
      return;
    }

    const [nextStatus, subscription] = await Promise.all([
      getPushStatus(),
      getCurrentBrowserSubscription(),
    ]);
    setPushStatus(nextStatus);
    setCurrentSubscription(subscription);
  }, []);

  const refreshHousekeeping = useCallback(async () => {
    if (!canUseHousekeeping) {
      return;
    }

    const [nextBoard, nextStaff] = await Promise.all([
      getHousekeepingBoard(),
      getHousekeepingStaff(),
    ]);
    setBoard(nextBoard);
    setStaff(nextStaff.members);
    setSelectedRoom((current) => selectedRoomFromBoard(nextBoard, current));
    await updateAppBadge(nextBoard.summary.total);
  }, [canUseHousekeeping]);

  useEffect(() => {
    void getBackendStatus().then(setStatus).catch(() => undefined);
    if (enabledModules.parking) {
      void getParkingDetections().then(setDetections).catch(() => undefined);
    }
    if (enabledModules.checkout) {
      void getCheckoutOverview().then(setCheckout).catch(() => undefined);
    }
  }, [enabledModules.checkout, enabledModules.parking]);

  useEffect(() => {
    void refreshPush().catch(() => undefined);
  }, [refreshPush]);

  useEffect(() => {
    void refreshHousekeeping().catch(() => undefined);
    if (!canUseHousekeeping) {
      return undefined;
    }

    const interval = window.setInterval(() => {
      void refreshHousekeeping().catch(() => undefined);
    }, 10_000);
    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        void refreshHousekeeping().catch(() => undefined);
      }
    };
    window.addEventListener("focus", handleVisibility);
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", handleVisibility);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [canUseHousekeeping, refreshHousekeeping]);

  useEffect(() => {
    if (!("serviceWorker" in navigator)) {
      return undefined;
    }

    const handler = (event: MessageEvent) => {
      if (event.data?.type !== "HOTELAPP_PUSH_RECEIVED") {
        return;
      }

      setPushNotice(event.data.payload?.body || "Nueva notificacion recibida.");
      void refreshHousekeeping().catch(() => undefined);
    };

    navigator.serviceWorker.addEventListener("message", handler);
    return () => navigator.serviceWorker.removeEventListener("message", handler);
  }, [refreshHousekeeping]);

  const checkoutsToday = checkout?.events.filter((event) => isToday(event.timestamp)).length ?? 0;
  const waitingRooms =
    checkout?.rooms.filter((room) => room.status === "ready_for_cleaning").length ?? 0;
  const detectionsToday = detections.filter((detection) => isToday(detection.detectedAt)).length;
  const telegramCommand = telegramPairing ? `/staff ${telegramPairing.code}` : "";
  const currentEndpoint = currentSubscription?.endpoint || "";
  const pushActive = Boolean(
    currentEndpoint &&
      pushStatus?.subscriptions.some(
        (subscription) => subscription.endpoint === currentEndpoint && !subscription.disabledAt,
      ),
  );
  const assignableStaff = staff.filter((member) =>
    ["platform_admin", "tenant_admin", "manager", "staff"].includes(member.role),
  );

  async function linkTelegram() {
    setTelegramBusy(true);
    setTelegramNotice("");
    try {
      setTelegramPairing(await generateTelegramStaffPairingCode());
    } catch (error) {
      setTelegramNotice(error instanceof Error ? error.message : "No se pudo generar el codigo.");
    } finally {
      setTelegramBusy(false);
    }
  }

  async function copyTelegramCommand() {
    try {
      await navigator.clipboard.writeText(telegramCommand);
      setTelegramNotice("Comando copiado.");
    } catch {
      setTelegramNotice("No se pudo copiar. Manten pulsado el comando para copiarlo.");
    }
  }

  async function activateNotifications() {
    setPushBusy("activate");
    setPushNotice("");
    try {
      await activatePushDevice();
      setPushPermission(permissionState());
      await refreshPush();
      setPushNotice("Notificaciones activadas en este dispositivo.");
    } catch (error) {
      setPushNotice(error instanceof Error ? error.message : "No se pudieron activar.");
    } finally {
      setPushBusy("");
    }
  }

  async function deactivateNotifications() {
    setPushBusy("deactivate");
    setPushNotice("");
    try {
      await deactivatePushDevice();
      await refreshPush();
      setPushNotice("Notificaciones desactivadas en este dispositivo.");
    } catch (error) {
      setPushNotice(error instanceof Error ? error.message : "No se pudieron desactivar.");
    } finally {
      setPushBusy("");
    }
  }

  async function patchPreference(patch: Partial<PushPreference>) {
    const preference = await updatePushPreferences(patch);
    setPushStatus((current) => current && { ...current, preference });
  }

  async function sendTestNow() {
    if (!currentEndpoint) {
      setPushNotice("Activa este dispositivo primero.");
      return;
    }

    setPushBusy("test");
    setPushNotice("");
    try {
      await sendPushTest(currentEndpoint);
      setPushNotice("Prueba enviada.");
    } catch (error) {
      setPushNotice(error instanceof Error ? error.message : "No se pudo enviar la prueba.");
    } finally {
      setPushBusy("");
    }
  }

  async function scheduleTest() {
    if (!currentEndpoint) {
      setPushNotice("Activa este dispositivo primero.");
      return;
    }

    setPushBusy("schedule");
    setPushNotice("");
    try {
      const result = await schedulePushTest(currentEndpoint, testDelay);
      setPushNotice(
        `Notificacion programada para dentro de ${result.delaySeconds} s. Puedes bloquear el movil o cerrar HotelApp.`,
      );
    } catch (error) {
      setPushNotice(error instanceof Error ? error.message : "No se pudo programar la prueba.");
    } finally {
      setPushBusy("");
    }
  }

  async function runHousekeepingAction(action: HousekeepingAction) {
    if (!selectedRoom) {
      return;
    }

    setHousekeepingBusy(action);
    setHousekeepingNotice("");
    try {
      const result = await performHousekeepingAction({
        action,
        eventId: selectedRoom.eventId,
        assignmentTargetUserId: action === "assign" ? assignmentTargetUserId : undefined,
      });
      setBoard(result.board);
      setSelectedRoom(selectedRoomFromBoard(result.board, selectedRoom));
      setHousekeepingNotice("Actualizado.");
      await updateAppBadge(result.board.summary.total);
    } catch (error) {
      setHousekeepingNotice(error instanceof Error ? error.message : "No se pudo actualizar.");
    } finally {
      setHousekeepingBusy("");
    }
  }

  async function createManualCheckout() {
    if (!manualRoomId) {
      setHousekeepingNotice("Selecciona una habitacion.");
      return;
    }

    setHousekeepingBusy("manual");
    setHousekeepingNotice("");
    try {
      await manualHousekeepingCheckout({
        roomId: manualRoomId,
        assignmentTargetUserId: manualAssigneeUserId || undefined,
      });
      setManualOpen(false);
      setManualRoomId("");
      setManualAssigneeUserId("");
      await refreshHousekeeping();
      setHousekeepingNotice("Checkout manual registrado.");
    } catch (error) {
      setHousekeepingNotice(error instanceof Error ? error.message : "No se pudo registrar.");
    } finally {
      setHousekeepingBusy("");
    }
  }

  return (
    <section className="module-page">
      <div className="module-title">
        <div>
          <h1>Dashboard</h1>
          <p>Current operational signal from enabled modules.</p>
        </div>
      </div>
      <div className="platform-stats">
        {enabledModules.checkout && (
          <>
            <article className="stat-item">
              <span>Rooms waiting for cleaning</span>
              <strong>{waitingRooms}</strong>
            </article>
            <article className="stat-item">
              <span>Checkouts today</span>
              <strong>{checkoutsToday}</strong>
            </article>
          </>
        )}
        {enabledModules.parking && (
          <article className="stat-item">
            <span>Parking detections today</span>
            <strong>{detectionsToday}</strong>
          </article>
        )}
        <article className="stat-item">
          <span>Current reservations</span>
          <strong>{status?.reservationsLoaded ?? 0}</strong>
        </article>
      </div>

      {canUseHousekeeping && (
        <section className="panel notification-card">
          <div className="section-heading">
            <h2>
              <Bell size={18} /> Notificaciones
            </h2>
            <button
              type="button"
              className="icon-button small"
              onClick={() => void refreshPush()}
              title="Actualizar"
              aria-label="Actualizar notificaciones"
            >
              <RefreshCw size={16} />
            </button>
          </div>
          <div className="notification-body">
            {!browserSupportsWebPush() && shouldShowIosInstallHint() ? (
              <div className="notification-state">
                <BellOff size={18} />
                <strong>Instala HotelApp en la pantalla de inicio para activar notificaciones.</strong>
                <span>En Safari: compartir, Anadir a pantalla de inicio, abrir HotelApp instalada.</span>
              </div>
            ) : !browserSupportsWebPush() ? (
              <div className="notification-state">
                <BellOff size={18} />
                <strong>Este dispositivo/navegador no soporta Web Push.</strong>
              </div>
            ) : pushPermission === "denied" ? (
              <div className="notification-state">
                <BellOff size={18} />
                <strong>Permiso bloqueado para este dispositivo.</strong>
                <span>Activalo desde los ajustes del navegador o del sistema.</span>
              </div>
            ) : !pushActive ? (
              <div className="notification-state">
                <Bell size={18} />
                <strong>
                  {pushPermission === "default"
                    ? "Permiso no solicitado"
                    : appIsStandalone()
                      ? "Listo para activar en este dispositivo"
                      : "Instalable como PWA"}
                </strong>
                <button
                  type="button"
                  className="primary-button"
                  onClick={() => void activateNotifications()}
                  disabled={Boolean(pushBusy)}
                >
                  <Bell size={16} /> {pushBusy === "activate" ? "Activando..." : "Activar notificaciones"}
                </button>
              </div>
            ) : (
              <div className="notification-state active">
                <CheckCircle2 size={18} />
                <strong>Notificaciones activadas en este dispositivo</strong>
                <span>{pushStatus?.subscriptionCount ?? 1} dispositivo(s) registrado(s)</span>
                <button
                  type="button"
                  onClick={() => void deactivateNotifications()}
                  disabled={Boolean(pushBusy)}
                >
                  <BellOff size={16} /> Desactivar en este dispositivo
                </button>
              </div>
            )}

            {pushActive && pushStatus?.preference && (
              <div className="push-preferences">
                <label className="checkbox-row">
                  <input
                    type="checkbox"
                    checked={pushStatus.preference.enabled}
                    onChange={(event) => void patchPreference({ enabled: event.target.checked })}
                  />
                  <span>Activas</span>
                </label>
                <label className="checkbox-row">
                  <input
                    type="checkbox"
                    checked={pushStatus.preference.newCheckout}
                    onChange={(event) => void patchPreference({ newCheckout: event.target.checked })}
                  />
                  <span>Nuevos checkouts</span>
                </label>
                <label className="checkbox-row">
                  <input
                    type="checkbox"
                    checked={pushStatus.preference.assignedToMe}
                    onChange={(event) => void patchPreference({ assignedToMe: event.target.checked })}
                  />
                  <span>Asignadas a mi</span>
                </label>
                <label className="checkbox-row">
                  <input
                    type="checkbox"
                    checked={pushStatus.preference.roomCompleted}
                    onChange={(event) => void patchPreference({ roomCompleted: event.target.checked })}
                  />
                  <span>Habitacion terminada</span>
                </label>
              </div>
            )}

            {pushActive && (
              <div className="push-test-grid">
                <button type="button" onClick={() => void sendTestNow()} disabled={Boolean(pushBusy)}>
                  <Send size={16} /> Enviar prueba ahora
                </button>
                <label>
                  <span>Enviar dentro de</span>
                  <input
                    type="number"
                    min={5}
                    max={600}
                    value={testDelay}
                    onChange={(event) => setTestDelay(Number(event.target.value))}
                  />
                  <span>s</span>
                </label>
                <button type="button" onClick={() => void scheduleTest()} disabled={Boolean(pushBusy)}>
                  <Clock size={16} /> Programar notificacion
                </button>
              </div>
            )}
            {pushNotice && <p className="telegram-link-notice" role="status">{pushNotice}</p>}
          </div>
        </section>
      )}

      {canUseHousekeeping && (
        <section className="panel housekeeping-panel">
          <div className="section-heading">
            <h2>🧹 Housekeeping today</h2>
            <div className="button-row">
              {canManageHousekeeping && (
                <button type="button" onClick={() => setManualOpen(true)}>
                  <Plus size={15} /> Checkout manual
                </button>
              )}
              <button type="button" onClick={() => void refreshHousekeeping()}>
                <RefreshCw size={15} /> Actualizar
              </button>
            </div>
          </div>
          <div className="housekeeping-list">
            {(board?.items || []).map((room) => (
              <button
                type="button"
                key={room.eventId}
                className="housekeeping-row"
                onClick={() => {
                  setSelectedRoom(room);
                  setAssignmentTargetUserId(room.housekeeping.assignedTo?.userId || "");
                }}
              >
                <strong>{room.roomNumber}</strong>
                <span>👤 {roomAssignee(room)}</span>
                <span>{roomProgressLabel(room)}</span>
              </button>
            ))}
            {(!board?.items || board.items.length === 0) && (
              <p className="empty-state">No hay habitaciones pendientes.</p>
            )}
          </div>
          {housekeepingNotice && (
            <p className="telegram-link-notice housekeeping-notice" role="status">
              {housekeepingNotice}
            </p>
          )}
        </section>
      )}

      <section className="panel telegram-link-card">
        <div className="section-heading">
          <h2>Telegram</h2>
        </div>
        {user?.telegramUserId ? (
          <div className="telegram-link-status">
            <strong>✅ Telegram vinculado</strong>
            {user.telegramUsername && <span>@{user.telegramUsername.replace(/^@/, "")}</span>}
          </div>
        ) : (
          <div className="telegram-link-content">
            <strong>Telegram no vinculado</strong>
            <p>Vincula tu usuario de Telegram para utilizar las funciones de housekeeping.</p>
            {!telegramPairing && (
              <button type="button" onClick={() => void linkTelegram()} disabled={telegramBusy}>
                {telegramBusy ? "Generando..." : "Vincular Telegram"}
              </button>
            )}
            {telegramPairing && (
              <div className="source-preview telegram-command">
                <code>{telegramCommand}</code>
                <p>Pega este comando en el bot de Telegram.</p>
                <div className="meta-list">
                  <span>Caduca</span>
                  <strong>{new Date(telegramPairing.expiresAt).toLocaleString()}</strong>
                </div>
                <div className="button-row">
                  <button type="button" onClick={() => void copyTelegramCommand()}>
                    <Copy size={15} /> Copiar
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
        {telegramNotice && <p className="telegram-link-notice" role="status">{telegramNotice}</p>}
      </section>
      <section className="panel">
        <div className="section-heading">
          <h2>Recent Activity</h2>
        </div>
        <div className="activity-list">
          {(checkout?.events || []).slice(0, 8).map((event) => {
            const room = checkout?.rooms.find((item) => item.id === event.roomId);
            return (
              <div key={event.id}>
                <span>{new Date(event.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                <strong>Room {room?.number || "-"}</strong>
                <span>Checkout via {event.source.toUpperCase()}</span>
              </div>
            );
          })}
          {(!checkout?.events || checkout.events.length === 0) && (
            <p className="empty-state">No recent activity.</p>
          )}
        </div>
      </section>

      {selectedRoom && (
        <div className="modal-backdrop housekeeping-sheet-backdrop" onClick={() => setSelectedRoom(undefined)}>
          <section className="housekeeping-sheet" onClick={(event) => event.stopPropagation()}>
            <button
              type="button"
              className="modal-close"
              onClick={() => setSelectedRoom(undefined)}
              aria-label="Cerrar"
            >
              <X size={16} />
            </button>
            <div className="housekeeping-sheet-title">
              <h2>🏠 Habitacion {selectedRoom.roomNumber}</h2>
              {selectedRoom.accessCode && <strong>🔑 Codigo: {selectedRoom.accessCode}</strong>}
            </div>
            <div className="housekeeping-detail-list">
              <span>👤 {roomAssignee(selectedRoom)}</span>
              <span>🛏 {selectedRoom.housekeeping.bedDoneAt ? "Cama hecha" : "Cama pendiente"}</span>
              <span>🧹 {selectedRoom.housekeeping.cleaningDoneAt ? "Limpieza hecha" : "Limpieza pendiente"}</span>
            </div>
            {canManageHousekeeping && (
              <div className="assign-row">
                <select
                  value={assignmentTargetUserId}
                  onChange={(event) => setAssignmentTargetUserId(event.target.value)}
                >
                  <option value="">Sin asignar</option>
                  {assignableStaff.map((member) => (
                    <option key={member.userId} value={member.userId}>
                      {member.displayName} · {member.role}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => void runHousekeepingAction("assign")}
                  disabled={!assignmentTargetUserId || housekeepingBusy === "assign"}
                >
                  <UserPlus size={15} /> Asignar
                </button>
              </div>
            )}
            <div className="housekeeping-action-grid">
              <button
                type="button"
                onClick={() => void runHousekeepingAction("claim")}
                disabled={Boolean(housekeepingBusy)}
              >
                <UserCheck size={15} /> Me encargo
              </button>
              <button
                type="button"
                onClick={() => void runHousekeepingAction("bed_done")}
                disabled={Boolean(housekeepingBusy)}
              >
                <Bed size={15} /> Cama hecha
              </button>
              <button
                type="button"
                onClick={() => void runHousekeepingAction("cleaning_done")}
                disabled={Boolean(housekeepingBusy)}
              >
                <Sparkles size={15} /> Limpieza hecha
              </button>
              <button
                type="button"
                className="primary-button"
                onClick={() => void runHousekeepingAction("complete")}
                disabled={Boolean(housekeepingBusy)}
              >
                <CheckCircle2 size={15} /> Finalizar
              </button>
            </div>
          </section>
        </div>
      )}

      {manualOpen && (
        <div className="modal-backdrop housekeeping-sheet-backdrop" onClick={() => setManualOpen(false)}>
          <section className="housekeeping-sheet" onClick={(event) => event.stopPropagation()}>
            <button
              type="button"
              className="modal-close"
              onClick={() => setManualOpen(false)}
              aria-label="Cerrar"
            >
              <X size={16} />
            </button>
            <div className="housekeeping-sheet-title">
              <h2>Checkout manual</h2>
            </div>
            <div className="manual-checkout-form">
              <label>
                <span>Habitacion</span>
                <select value={manualRoomId} onChange={(event) => setManualRoomId(event.target.value)}>
                  <option value="">Seleccionar</option>
                  {(board?.allRooms || []).map((room) => (
                    <option key={room.roomId} value={room.roomId}>
                      {room.roomNumber} · {room.status}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>Asignar a</span>
                <select
                  value={manualAssigneeUserId}
                  onChange={(event) => setManualAssigneeUserId(event.target.value)}
                >
                  <option value="">Sin asignar</option>
                  {assignableStaff.map((member) => (
                    <option key={member.userId} value={member.userId}>
                      {member.displayName} · {member.role}
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                className="primary-button"
                onClick={() => void createManualCheckout()}
                disabled={housekeepingBusy === "manual"}
              >
                <Plus size={15} /> Registrar checkout
              </button>
            </div>
          </section>
        </div>
      )}
    </section>
  );
}
