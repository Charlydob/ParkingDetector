import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const DEFAULT_PLATE_COOLDOWN_PATH = path.resolve(
  process.cwd(),
  process.env.PLATE_COOLDOWN_PATH ||
    path.join(process.env.DATA_DIR || "backend/data", "plate-cooldown.json"),
);

export async function createPlateCooldownStore(
  filePath = DEFAULT_PLATE_COOLDOWN_PATH,
) {
  const resolvedPath = path.resolve(filePath);
  let lastSeenByPlate = {};

  async function save() {
    await mkdir(path.dirname(resolvedPath), { recursive: true });
    await writeFile(
      resolvedPath,
      `${JSON.stringify(lastSeenByPlate, null, 2)}\n`,
      "utf8",
    );
  }

  try {
    const raw = await readFile(resolvedPath, "utf8");
    const parsed = JSON.parse(raw);
    lastSeenByPlate = parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed
      : {};
  } catch (error) {
    if (error.code !== "ENOENT") {
      throw error;
    }
    await save();
  }

  return {
    isCoolingDown(plate, detectedAt, cooldownMinutes) {
      const lastSeenAt = lastSeenByPlate[plate];

      if (!lastSeenAt) {
        return false;
      }

      const detectedTime = new Date(detectedAt).getTime();
      const lastSeenTime = new Date(lastSeenAt).getTime();

      if (!Number.isFinite(detectedTime) || !Number.isFinite(lastSeenTime)) {
        return false;
      }

      return detectedTime - lastSeenTime >= 0
        && detectedTime - lastSeenTime < cooldownMinutes * 60000;
    },
    async mark(plate, detectedAt) {
      lastSeenByPlate[plate] = detectedAt;
      await save();
    },
    count() {
      return Object.keys(lastSeenByPlate).length;
    },
  };
}
