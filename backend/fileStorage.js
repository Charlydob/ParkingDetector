import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const DEFAULT_EVIDENCE_DIR = "./backend/evidence";

function sanitizeFilePart(value) {
  return String(value ?? "")
    .trim()
    .replace(/[^a-zA-Z0-9_-]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 80) || "unknown";
}

function timestampForFile(value) {
  const date = value ? new Date(value) : new Date();
  const safeDate = Number.isNaN(date.getTime()) ? new Date() : date;
  return safeDate.toISOString().replace(/[:.]/g, "-");
}

function relativeForFirebase(filePath) {
  return path.relative(process.cwd(), filePath).split(path.sep).join("/");
}

export function createFileStorage(baseDir = process.env.EVIDENCE_DIR || DEFAULT_EVIDENCE_DIR) {
  const evidenceDir = path.resolve(process.cwd(), baseDir);
  const snapshotsDir = path.join(evidenceDir, "snapshots");
  const clipsDir = path.join(evidenceDir, "clips");

  async function ensureDirectories() {
    await mkdir(snapshotsDir, { recursive: true });
    await mkdir(clipsDir, { recursive: true });
  }

  async function saveEvidenceBuffer({
    kind,
    eventId,
    plate,
    detectedAt,
    buffer,
  }) {
    if (!buffer) {
      return undefined;
    }

    await ensureDirectories();

    const extension = kind === "clip" ? "mp4" : "jpg";
    const directory = kind === "clip" ? clipsDir : snapshotsDir;
    const filename = [
      sanitizeFilePart(eventId),
      sanitizeFilePart(plate),
      timestampForFile(detectedAt),
    ].join("_");
    const filePath = path.join(directory, `${filename}.${extension}`);

    await writeFile(filePath, buffer);
    return relativeForFirebase(filePath);
  }

  return {
    ensureDirectories,
    saveEvidenceBuffer,
  };
}
