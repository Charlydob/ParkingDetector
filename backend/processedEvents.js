import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const DEFAULT_PROCESSED_EVENTS_PATH = path.resolve(
  process.cwd(),
  process.env.PROCESSED_EVENTS_PATH ||
    path.join(process.env.DATA_DIR || "backend/data", "processed-events.json"),
);

export async function createProcessedEventsStore(
  filePath = DEFAULT_PROCESSED_EVENTS_PATH,
) {
  const resolvedPath = path.resolve(filePath);
  let processedEvents = new Set();

  async function save() {
    await mkdir(path.dirname(resolvedPath), { recursive: true });
    await writeFile(
      resolvedPath,
      `${JSON.stringify([...processedEvents].sort(), null, 2)}\n`,
      "utf8",
    );
  }

  try {
    const raw = await readFile(resolvedPath, "utf8");
    const parsed = JSON.parse(raw);
    const ids = Array.isArray(parsed) ? parsed : Object.keys(parsed ?? {});
    processedEvents = new Set(ids.map(String));
  } catch (error) {
    if (error.code !== "ENOENT") {
      throw error;
    }
    await save();
  }

  return {
    has(eventId) {
      return processedEvents.has(String(eventId));
    },
    async mark(eventId) {
      processedEvents.add(String(eventId));
      await save();
    },
    count() {
      return processedEvents.size;
    },
  };
}
