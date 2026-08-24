import { Download, KeyRound, Plus, Printer, QrCode, RefreshCw } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
  createCheckoutKey,
  createCheckoutKeysBulk,
  createRoom,
  createRoomsBulk,
  getCheckoutKeys,
  getCheckoutOverview,
  manualCheckout,
  updateCheckoutKey,
  updateRoom,
} from "../../services/backendApi";
import type { CheckoutEvent, CheckoutOverview, KeyIdentifier, Room, RoomStatus } from "../../types/checkout";

const ALL_ROOMS = "__all__";

type QrTextMode = "none" | "label" | "room" | "label-room";

interface QrPreview {
  label: string;
  roomNumber?: string;
  dataUrl: string;
  checkoutUrl?: string;
  filename: string;
}

const filters: Array<{ id: "all" | RoomStatus; label: string }> = [
  { id: "all", label: "All" },
  { id: "ready_for_cleaning", label: "Pending cleaning" },
  { id: "cleaning", label: "Cleaning" },
  { id: "ready", label: "Ready" },
];

const qrTextModes: Array<{ id: QrTextMode; label: string }> = [
  { id: "none", label: "None" },
  { id: "label", label: "Label only" },
  { id: "room", label: "Room only" },
  { id: "label-room", label: "Label + room" },
];

function roomStatusLabel(status: RoomStatus) {
  return status.replace(/_/g, " ");
}

function formatTime(value?: string) {
  return value ? new Date(value).toLocaleString() : "-";
}

function slug(value: string) {
  return value.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase();
}

function qrCaption(mode: QrTextMode, label: string, roomNumber?: string) {
  const cleanLabel = label.trim();
  const cleanRoom = roomNumber?.trim();

  if (mode === "label" && cleanLabel) {
    return cleanLabel;
  }

  if (mode === "room" && cleanRoom) {
    return `Room ${cleanRoom}`;
  }

  if (mode === "label-room") {
    return [cleanLabel, cleanRoom ? `Room ${cleanRoom}` : ""].filter(Boolean).join(" ");
  }

  return "";
}

function qrFilename(label: string, roomNumber?: string) {
  const roomPart = roomNumber ? `room-${slug(roomNumber)}` : "checkout";
  const labelPart = slug(label || "checkout");

  return `${roomPart}-${labelPart}-qr.png`;
}

async function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Could not render QR image."));
    image.src = src;
  });
}

async function printableQrDataUrl({
  qrDataUrl,
  label,
  roomNumber,
  textMode,
}: {
  qrDataUrl: string;
  label: string;
  roomNumber?: string;
  textMode: QrTextMode;
}) {
  const caption = qrCaption(textMode, label, roomNumber);

  if (!caption) {
    return qrDataUrl;
  }

  const qrImage = await loadImage(qrDataUrl);
  const canvas = document.createElement("canvas");
  const qrSize = 620;
  const padding = 70;
  const captionHeight = 110;
  canvas.width = qrSize + padding * 2;
  canvas.height = qrSize + padding * 2 + captionHeight;

  const context = canvas.getContext("2d");
  if (!context) {
    return qrDataUrl;
  }

  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(qrImage, padding, padding, qrSize, qrSize);
  context.fillStyle = "#111827";
  context.font = "700 44px Arial, sans-serif";
  context.textAlign = "center";
  context.textBaseline = "middle";

  const maxWidth = canvas.width - padding * 2;
  let fontSize = 44;
  while (context.measureText(caption).width > maxWidth && fontSize > 24) {
    fontSize -= 2;
    context.font = `700 ${fontSize}px Arial, sans-serif`;
  }

  context.fillText(caption, canvas.width / 2, qrSize + padding + captionHeight / 2);
  return canvas.toDataURL("image/png");
}

export function CheckoutPage() {
  const [overview, setOverview] = useState<CheckoutOverview>();
  const [keys, setKeys] = useState<KeyIdentifier[]>([]);
  const [filter, setFilter] = useState<"all" | RoomStatus>("all");
  const [tab, setTab] = useState<"board" | "settings">("board");
  const [roomNumber, setRoomNumber] = useState("");
  const [roomName, setRoomName] = useState("");
  const [bulkRoomNumbers, setBulkRoomNumbers] = useState("");
  const [createQrForBulkRooms, setCreateQrForBulkRooms] = useState(true);
  const [selectedRoomId, setSelectedRoomId] = useState("");
  const [keyLabel, setKeyLabel] = useState("");
  const [regenerateExisting, setRegenerateExisting] = useState(false);
  const [qrTextMode, setQrTextMode] = useState<QrTextMode>("none");
  const [qrPreview, setQrPreview] = useState<QrPreview>();
  const [qrGallery, setQrGallery] = useState<QrPreview[]>([]);
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

  const activeRooms = useMemo(
    () => (overview?.rooms || []).filter((room) => room.active !== false),
    [overview?.rooms],
  );
  const rooms = useMemo(
    () => activeRooms.filter((room) => filter === "all" || room.status === filter),
    [activeRooms, filter],
  );

  async function previewForKey(
    key: KeyIdentifier & { qrDataUrl: string; checkoutUrl?: string },
    room?: Room,
  ): Promise<QrPreview> {
    const dataUrl = await printableQrDataUrl({
      qrDataUrl: key.qrDataUrl,
      label: key.label,
      roomNumber: room?.number,
      textMode: qrTextMode,
    });

    return {
      label: key.label,
      roomNumber: room?.number,
      dataUrl,
      checkoutUrl: key.checkoutUrl,
      filename: qrFilename(key.label, room?.number),
    };
  }

  async function addRoom() {
    const room = await createRoom({ number: roomNumber, name: roomName, status: "unknown" });
    setRoomNumber("");
    setRoomName("");
    setSelectedRoomId(room.id);
    setNotice("Room created.");
    await reload();
  }

  async function addRoomsBulk() {
    const result = await createRoomsBulk({
      numbers: bulkRoomNumbers,
      createQr: createQrForBulkRooms,
      keyLabel,
    });
    const createdRoomsById = new Map(result.created.map((room) => [room.id, room]));
    const gallery = await Promise.all(
      result.keys.map((key) => previewForKey(key, createdRoomsById.get(key.roomId))),
    );

    setBulkRoomNumbers("");
    setQrGallery(gallery);
    setQrPreview(gallery[0]);
    setNotice(
      `Created ${result.summary.created} rooms. Skipped ${result.summary.skippedExisting} existing${
        result.duplicateInput.length ? ` and ${result.duplicateInput.length} duplicate inputs` : ""
      }.`,
    );
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
    if (selectedRoomId === ALL_ROOMS) {
      const result = await createCheckoutKeysBulk({ label: keyLabel, regenerateExisting });
      const roomsById = new Map(activeRooms.map((room) => [room.id, room]));
      const gallery = await Promise.all(
        result.keys.map((key) => previewForKey(key, roomsById.get(key.roomId))),
      );

      setQrGallery(gallery);
      setQrPreview(gallery[0]);
      setNotice(
        `Generated ${result.summary.created} new QR keys, regenerated ${result.summary.regenerated}, skipped ${result.summary.skippedExisting} existing.`,
      );
      await reload();
      return;
    }

    const key = await createCheckoutKey({ roomId: selectedRoomId, label: keyLabel });
    const room = activeRooms.find((item) => item.id === selectedRoomId);
    const preview = await previewForKey(key, room);
    setKeyLabel("");
    setQrGallery([preview]);
    setQrPreview(preview);
    setNotice("QR key created.");
    await reload();
  }

  async function regenerate(key: KeyIdentifier) {
    const next = await updateCheckoutKey(key.id, { regenerate: true });
    const room = activeRooms.find((item) => item.id === next.roomId);
    const preview = await previewForKey(next, room);
    setQrGallery([preview]);
    setQrPreview(preview);
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

  function downloadQr(item = qrPreview) {
    if (!item) {
      return;
    }

    const link = document.createElement("a");
    link.href = item.dataUrl;
    link.download = item.filename;
    link.click();
  }

  function printGallery() {
    if (qrGallery.length === 0) {
      return;
    }

    const popup = window.open("", "_blank", "noopener,noreferrer");
    if (!popup) {
      setNotice("Could not open print sheet.");
      return;
    }

    popup.document.write(`<!doctype html><html><head><title>Checkout QR set</title>
      <style>
        body { font-family: Arial, sans-serif; margin: 24px; }
        .grid { display: grid; gap: 24px; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); }
        .item { break-inside: avoid; text-align: center; }
        img { max-width: 220px; width: 100%; }
        strong { display: block; margin-top: 8px; }
      </style></head><body><div class="grid">
      ${qrGallery
        .map(
          (item) =>
            `<div class="item"><img src="${item.dataUrl}" alt=""><strong>Room ${
              item.roomNumber || "-"
            } - ${item.label}</strong></div>`,
        )
        .join("")}
      </div><script>window.onload = () => window.print();</script></body></html>`);
    popup.document.close();
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
              <label>
                <span>Bulk room numbers</span>
                <textarea
                  value={bulkRoomNumbers}
                  onChange={(event) => setBulkRoomNumbers(event.target.value)}
                  placeholder={"101, 102, 103\n104\n105"}
                  rows={5}
                />
              </label>
              <label className="checkbox-row">
                <input
                  type="checkbox"
                  checked={createQrForBulkRooms}
                  onChange={(event) => setCreateQrForBulkRooms(event.target.checked)}
                />
                <span>Create QR for each room</span>
              </label>
              <button type="button" onClick={addRoomsBulk} disabled={!bulkRoomNumbers.trim()}>
                <Plus size={15} />
                Create rooms in bulk
              </button>
              <div className="settings-table">
                {activeRooms.map((room) => (
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
                    <option value={ALL_ROOMS}>All rooms</option>
                    {activeRooms.map((room) => (
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
              <div className="settings-split">
                <label>
                  <span>QR text</span>
                  <select value={qrTextMode} onChange={(event) => setQrTextMode(event.target.value as QrTextMode)}>
                    {qrTextModes.map((mode) => (
                      <option key={mode.id} value={mode.id}>
                        {mode.label}
                      </option>
                    ))}
                  </select>
                </label>
                {selectedRoomId === ALL_ROOMS && (
                  <label className="checkbox-row">
                    <input
                      type="checkbox"
                      checked={regenerateExisting}
                      onChange={(event) => setRegenerateExisting(event.target.checked)}
                    />
                    <span>Regenerate existing QR keys</span>
                  </label>
                )}
              </div>
              <button type="button" onClick={createKey} disabled={!selectedRoomId || activeRooms.length === 0}>
                <KeyRound size={15} />
                {selectedRoomId === ALL_ROOMS ? "Generate QR set" : "Create QR key"}
              </button>
              <div className="settings-table">
                {keys.map((key) => {
                  const room = activeRooms.find((item) => item.id === key.roomId);
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
                  <div className="button-row">
                    <button type="button" onClick={() => downloadQr()}>
                      <Download size={15} />
                      Download PNG
                    </button>
                    {qrGallery.length > 1 && (
                      <button type="button" onClick={printGallery}>
                        <Printer size={15} />
                        Print all
                      </button>
                    )}
                  </div>
                  {qrGallery.length > 1 && (
                    <div className="qr-gallery">
                      {qrGallery.map((item) => (
                        <div key={item.filename}>
                          <img src={item.dataUrl} alt={`${item.label} room ${item.roomNumber || ""} QR`} />
                          <strong>Room {item.roomNumber || "-"}</strong>
                          <span>{item.label}</span>
                          <button type="button" onClick={() => downloadQr(item)}>
                            <Download size={14} />
                            Download
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
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
