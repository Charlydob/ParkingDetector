import { readFile } from "node:fs/promises";
import path from "node:path";
import { buildDetectionPayload, normalizePlate } from "../shared/detectionLogic.mjs";
import { normalizeReservationRecords } from "../shared/reservationRecordMapper.mjs";
import {
  getEventDetectedAt,
  getRecognizedLicensePlate,
} from "./frigateClient.js";

async function readJsonReservations(jsonUrl) {
  if (/^https?:\/\//i.test(jsonUrl)) {
    const response = await fetch(jsonUrl);
    if (!response.ok) {
      throw new Error(`No se pudo descargar JSON de reservas (${response.status}).`);
    }
    return response.json();
  }

  const localPath = jsonUrl.startsWith("/")
    ? path.join(process.cwd(), "public", jsonUrl)
    : path.resolve(process.cwd(), jsonUrl);
  return JSON.parse(await readFile(localPath, "utf8"));
}

function parseCsv(csvText) {
  const rows = [];
  let current = "";
  let row = [];
  let inQuotes = false;

  for (let index = 0; index < csvText.length; index += 1) {
    const character = csvText[index];
    const nextCharacter = csvText[index + 1];

    if (character === '"' && inQuotes && nextCharacter === '"') {
      current += '"';
      index += 1;
      continue;
    }

    if (character === '"') {
      inQuotes = !inQuotes;
      continue;
    }

    if (character === "," && !inQuotes) {
      row.push(current.trim());
      current = "";
      continue;
    }

    if ((character === "\n" || character === "\r") && !inQuotes) {
      if (character === "\r" && nextCharacter === "\n") {
        index += 1;
      }

      row.push(current.trim());
      if (row.some((cell) => cell.length > 0)) {
        rows.push(row);
      }
      row = [];
      current = "";
      continue;
    }

    current += character;
  }

  row.push(current.trim());
  if (row.some((cell) => cell.length > 0)) {
    rows.push(row);
  }

  const [headers, ...dataRows] = rows;
  if (!headers) {
    return [];
  }

  return dataRows.map((dataRow) =>
    headers.reduce((record, header, index) => {
      record[header.trim()] = dataRow[index]?.trim() ?? "";
      return record;
    }, {}),
  );
}

async function getReservations() {
  const source = process.env.VITE_RESERVATION_SOURCE || "demo";

  if (source === "googleSheets") {
    const sheetUrl = process.env.VITE_GOOGLE_SHEET_URL;
    if (!sheetUrl) {
      throw new Error("Falta configurar VITE_GOOGLE_SHEET_URL.");
    }

    const response = await fetch(sheetUrl);
    if (!response.ok) {
      throw new Error(`No se pudo descargar Google Sheets (${response.status}).`);
    }

    return normalizeReservationRecords(parseCsv(await response.text()));
  }

  const jsonUrl = source === "json"
    ? process.env.VITE_RESERVATION_JSON_URL || "/demo-reservations.json"
    : "/demo-reservations.json";
  const payload = await readJsonReservations(jsonUrl);

  if (!Array.isArray(payload)) {
    throw new Error("El JSON de reservas debe ser un array.");
  }

  return normalizeReservationRecords(payload);
}

export function createEventProcessor({
  firebaseClient,
  frigateClient,
  fileStorage,
  processedEvents,
  onDetectionStored,
}) {
  async function processFrigateDetection(input) {
    const reservations = await getReservations();
    const detectionPayload = buildDetectionPayload(input, reservations);
    const detection = await firebaseClient.createDetection(detectionPayload);

    if (detectionPayload.associationStatus === "matched") {
      console.log(`[Reservations] Match found: room ${detectionPayload.room}`);
    } else {
      console.log(`[Reservations] No unique match: ${detectionPayload.associationStatus}`);
    }

    console.log("[Firebase] Detection stored");
    onDetectionStored?.(detection);
    return detection;
  }

  async function processFrigateEvent(event) {
    const eventId = event.id;

    if (!eventId || processedEvents.has(eventId)) {
      return undefined;
    }

    const plate = normalizePlate(getRecognizedLicensePlate(event));
    if (!plate) {
      return undefined;
    }

    const detectedAt = getEventDetectedAt(event);
    const camera = event.camera || "unknown";
    console.log(`[LPR] New plate: ${plate}`);

    let localSnapshotPath;
    let localVideoPath;

    try {
      const snapshotBuffer = await frigateClient.getSnapshotBuffer(eventId);
      localSnapshotPath = await fileStorage.saveEvidenceBuffer({
        kind: "snapshot",
        eventId,
        plate,
        detectedAt,
        buffer: snapshotBuffer,
      });

      if (localSnapshotPath) {
        console.log("[Evidence] Snapshot saved");
      }
    } catch (error) {
      console.warn(`[Evidence] Snapshot not saved: ${error.message}`);
    }

    if (event.has_clip !== false) {
      try {
        const clipBuffer = await frigateClient.getClipBuffer(eventId);
        localVideoPath = await fileStorage.saveEvidenceBuffer({
          kind: "clip",
          eventId,
          plate,
          detectedAt,
          buffer: clipBuffer,
        });

        if (localVideoPath) {
          console.log("[Evidence] Clip saved");
        }
      } catch (error) {
        console.warn(`[Evidence] Clip not saved: ${error.message}`);
      }
    }

    const detection = await processFrigateDetection({
      plate,
      detectedAt,
      camera,
      localSnapshotPath,
      localVideoPath,
    });

    await processedEvents.mark(eventId);
    return detection;
  }

  return {
    processFrigateDetection,
    processFrigateEvent,
  };
}
