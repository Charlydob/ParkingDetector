import { Download, KeyRound, Plus, QrCode, RefreshCw } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
  createCheckoutKey,
  createRoom,
  getCheckoutKeys,
  getCheckoutOverview,
  manualCheckout,
  updateCheckoutKey,
  updateRoom,
} from "../../services/backendApi";
import type { CheckoutEvent, CheckoutOverview, KeyIdentifier, Room, RoomStatus } from "../../types/checkout";

const filters: Array<{ id: "all" | RoomStatus; label: string }> = [
  { id: "all", label: "All" },
  { id: "ready_for_cleaning", label: "Pending cleaning" },
  { id: "cleaning", label: "Cleaning" },
  { id: "ready", label: "Ready" },
];

function roomStatusLabel(status: RoomStatus) {
  return status.replace(/_/g, " ");
}

function formatTime(value?: string) {
  return value ? new Date(value).toLocaleString() : "-";
}

export function CheckoutPage() {
  const [overview, setOverview] = useState<CheckoutOverview>();
  const [keys, setKeys] = useState<KeyIdentifier[]>([]);
  const [filter, setFilter] = useState<"all" | RoomStatus>("all");
  const [tab, setTab] = useState<"board" | "settings">("board");
  const [roomNumber, setRoomNumber] = useState("");
  const [roomName, setRoomName] = useState("");
  const [selectedRoomId, setSelectedRoomId] = useState("");
  const [keyLabel, setKeyLabel] = useState("");
  const [qrPreview, setQrPreview] = useState<{ label: string; dataUrl: string; checkoutUrl?: string }>();
  const [notice, setNotice] = useState("");

  async function reload() {
    const [nextOverview, nextKeys] = await Promise.all([getCheckoutOverview(), getCheckoutKeys()]);
    setOverview(nextOverview);
    setKeys(nextKeys);
    setSelectedRoomId((current) => current || nextOverview.rooms[0]?.id || "");
  }

  useEffect(() => {
    void reload().catch((error) =>
      setNotice(error instanceof Error ? error.message : "Could not load checkout."),
    );
  }, []);

  const rooms = useMemo(
    () =>
      (overview?.rooms || []).filter((room) => filter === "all" || room.status === filter),
    [filter, overview?.rooms],
  );

  async function addRoom() {
    const room = await createRoom({ number: roomNumber, name: roomName, status: "unknown" });
    setRoomNumber("");
    setRoomName("");
    setSelectedRoomId(room.id);
    setNotice("Room created.");
    await reload();
  }

  async function saveRoomStatus(room: Room, status: RoomStatus) {
    await updateRoom(room.id, { status });
    await reload();
  }

  async function deactivateRoom(room: Room) {
    await updateRoom(room.id, { active: false });
    await reload();
  }

  async function createKey() {
    const key = await createCheckoutKey({ roomId: selectedRoomId, label: keyLabel });
    setKeyLabel("");
    setQrPreview({ label: key.label, dataUrl: key.qrDataUrl, checkoutUrl: key.checkoutUrl });
    setNotice("QR key created.");
    await reload();
  }

  async function regenerate(key: KeyIdentifier) {
    const next = await updateCheckoutKey(key.id, { regenerate: true });
    setQrPreview({ label: next.label, dataUrl: next.qrDataUrl, checkoutUrl: next.checkoutUrl });
    setNotice("QR token regenerated.");
    await reload();
  }

  async function toggleKey(key: KeyIdentifier) {
    await updateCheckoutKey(key.id, { active: !key.active });
    await reload();
  }

  async function checkoutManually(room: Room) {
    await manualCheckout(room.id);
    setNotice(`Room ${room.number} checked out manually.`);
    await reload();
  }

  function downloadQr() {
    if (!qrPreview) {
      return;
    }

    const link = document.createElement("a");
    link.href = qrPreview.dataUrl;
    link.download = `${qrPreview.label.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-checkout-qr.png`;
    link.click();
  }

  return (
    <section className="module-page checkout-page">
      <div className="module-title">
        <div>
          <h1>Checkout</h1>
          <p>Guest key checkout events and room readiness.</p>
        </div>
        <div className="button-row">
          <button type="button" onClick={() => void reload()}>
            <RefreshCw size={15} />
            Refresh
          </button>
        </div>
      </div>

      {notice && <div className={notice.includes("Could not") ? "notice error" : "notice"}>{notice}</div>}

      <div className="segmented-control compact" role="tablist" aria-label="Checkout views">
        <button className={tab === "board" ? "active" : ""} type="button" onClick={() => setTab("board")}>
          Board
        </button>
        <button className={tab === "settings" ? "active" : ""} type="button" onClick={() => setTab("settings")}>
          Settings
        </button>
      </div>

      {tab === "board" ? (
        <div className="checkout-grid">
          <section className="panel">
            <div className="section-heading">
              <h2>Rooms</h2>
              <span>{rooms.length}</span>
            </div>
            <div className="checkout-filters">
              {filters.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={filter === item.id ? "active" : ""}
                  onClick={() => setFilter(item.id)}
                >
                  {item.label}
                </button>
              ))}
            </div>
            <div className="room-list">
              {rooms.map((room) => (
                <article className="room-row" key={room.id}>
                  <div>
                    <strong>Room {room.number}</strong>
                    <span>{room.name || roomStatusLabel(room.status)}</span>
                  </div>
                  <span className={`room-status ${room.status}`}>{roomStatusLabel(room.status)}</span>
                  <span>{formatTime(room.lastCheckoutAt)}</span>
                  <span>{room.lastCheckoutSource?.toUpperCase() || "-"}</span>
                  <div className="row-actions">
                    <button type="button" onClick={() => checkoutManually(room)}>
                      Manual
                    </button>
                    <select
                      value={room.status}
                      onChange={(event) => saveRoomStatus(room, event.target.value as RoomStatus)}
                    >
                      <option value="occupied">Occupied</option>
                      <option value="ready_for_cleaning">Ready for cleaning</option>
                      <option value="cleaning">Cleaning</option>
                      <option value="ready">Ready</option>
                      <option value="unknown">Unknown</option>
                    </select>
                  </div>
                </article>
              ))}
              {rooms.length === 0 && <p className="empty-state">No rooms match this filter.</p>}
            </div>
          </section>

          <RecentEvents events={overview?.events || []} rooms={overview?.rooms || []} />
        </div>
      ) : (
        <div className="checkout-grid">
          <section className="panel">
            <div className="section-heading">
              <h2>Rooms</h2>
            </div>
            <div className="settings-form">
              <div className="settings-split">
                <label>
                  <span>Room number</span>
                  <input value={roomNumber} onChange={(event) => setRoomNumber(event.target.value)} />
                </label>
                <label>
                  <span>Name</span>
                  <input value={roomName} onChange={(event) => setRoomName(event.target.value)} />
                </label>
              </div>
              <button type="button" onClick={addRoom} disabled={!roomNumber.trim()}>
                <Plus size={15} />
                Create room
              </button>
              <div className="settings-table">
                {(overview?.rooms || []).map((room) => (
                  <div key={room.id}>
                    <strong>Room {room.number}</strong>
                    <span>{room.name || "-"}</span>
                    <span>{roomStatusLabel(room.status)}</span>
                    <button type="button" onClick={() => deactivateRoom(room)}>
                      Deactivate
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </section>

          <section className="panel">
            <div className="section-heading">
              <h2>Keys</h2>
            </div>
            <div className="settings-form">
              <div className="settings-split">
                <label>
                  <span>Room</span>
                  <select value={selectedRoomId} onChange={(event) => setSelectedRoomId(event.target.value)}>
                    {(overview?.rooms || []).map((room) => (
                      <option key={room.id} value={room.id}>
                        Room {room.number}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>Label</span>
                  <input value={keyLabel} onChange={(event) => setKeyLabel(event.target.value)} />
                </label>
              </div>
              <button type="button" onClick={createKey} disabled={!selectedRoomId}>
                <KeyRound size={15} />
                Create QR key
              </button>
              <div className="settings-table">
                {keys.map((key) => {
                  const room = overview?.rooms.find((item) => item.id === key.roomId);
                  return (
                    <div key={key.id}>
                      <strong>{key.label}</strong>
                      <span>Room {room?.number || "-"}</span>
                      <span>{key.active ? "Active" : "Inactive"}</span>
                      <button type="button" onClick={() => regenerate(key)}>
                        Regenerate
                      </button>
                      <button type="button" onClick={() => toggleKey(key)}>
                        {key.active ? "Deactivate" : "Activate"}
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          </section>

          <section className="panel">
            <div className="section-heading">
              <h2>Public checkout</h2>
              <QrCode size={17} />
            </div>
            <div className="settings-form">
              <label>
                <span>Public URL</span>
                <input readOnly value={overview?.publicUrl || ""} />
              </label>
              {overview?.publicQrDataUrl && (
                <img className="qr-preview" src={overview.publicQrDataUrl} alt="Public checkout QR" />
              )}
              <strong>Enabled</strong>
            </div>
          </section>

          <section className="panel">
            <div className="section-heading">
              <h2>QR preview</h2>
            </div>
            <div className="settings-form">
              {qrPreview ? (
                <>
                  <img className="qr-preview" src={qrPreview.dataUrl} alt={`${qrPreview.label} QR`} />
                  {qrPreview.checkoutUrl && (
                    <label>
                      <span>Direct URL</span>
                      <input readOnly value={qrPreview.checkoutUrl} />
                    </label>
                  )}
                  <button type="button" onClick={downloadQr}>
                    <Download size={15} />
                    Download PNG
                  </button>
                </>
              ) : (
                <p className="empty-state">Create or regenerate a key to preview its printable QR.</p>
              )}
            </div>
          </section>
        </div>
      )}
    </section>
  );
}

function RecentEvents({ events, rooms }: { events: CheckoutEvent[]; rooms: Room[] }) {
  return (
    <section className="panel">
      <div className="section-heading">
        <h2>Recent activity</h2>
      </div>
      <div className="activity-list">
        {events.slice(0, 20).map((event) => {
          const room = rooms.find((item) => item.id === event.roomId);
          return (
            <div key={event.id}>
              <span>{new Date(event.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
              <strong>Room {room?.number || "-"}</strong>
              <span>Checkout via {event.source.toUpperCase()}</span>
            </div>
          );
        })}
        {events.length === 0 && <p className="empty-state">No checkout activity yet.</p>}
      </div>
    </section>
  );
}
