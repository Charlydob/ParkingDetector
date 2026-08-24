import { mkdir, unlink, writeFile } from "node:fs/promises";
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

function relativeForDisplay(filePath) {
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
    return relativeForDisplay(filePath);
  }

  async function deleteEvidencePath(relativePath) {
    if (!relativePath) {
      return;
    }

    const filePath = path.resolve(process.cwd(), relativePath);
    const allowedRoot = `${evidenceDir}${path.sep}`;

    if (!filePath.startsWith(allowedRoot)) {
      throw new Error(`Ruta de evidencia fuera de ${relativeForDisplay(evidenceDir)}.`);
    }

    try {
      await unlink(filePath);
    } catch (error) {
      if (error.code !== "ENOENT") {
        throw error;
      }
    }
  }

  function getEvidenceFilePath(kind, filename) {
    const directory = kind === "clip" ? clipsDir : snapshotsDir;
    const filePath = path.resolve(directory, path.basename(filename));
    const allowedRoot = `${directory}${path.sep}`;

    if (!filePath.startsWith(allowedRoot)) {
      throw new Error("Evidence path is outside the evidence directory.");
    }

    return filePath;
  }

  return {
    ensureDirectories,
    saveEvidenceBuffer,
    deleteEvidencePath,
    getEvidenceFilePath,
  };
}
