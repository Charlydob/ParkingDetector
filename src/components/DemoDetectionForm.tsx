import { Play } from "lucide-react";
import { useMemo, useState } from "react";
import { demoDetectionInputs } from "../data/demoDetections";
import { processFrigateDetection } from "../services/frigateDetectionService";
import type { Detection } from "../types/detection";

interface DemoDetectionFormProps {
  onCreated: (detection: Detection) => void;
  onError: (message: string) => void;
}

export function DemoDetectionForm({ onCreated, onError }: DemoDetectionFormProps) {
  const [plate, setPlate] = useState("ZH987654");
  const [camera, setCamera] = useState("Parking Sur");
  const [snapshotUrl, setSnapshotUrl] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const demoPlates = useMemo(
    () => ["BE 123 456", "zh-987654", "M 4455 ZX", "XX 000 999"],
    [],
  );

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!plate.trim() || !camera.trim()) {
      onError("Enter a license plate and camera.");
      return;
    }

    setSubmitting(true);
    try {
      const detection = await processFrigateDetection({
        plate,
        detectedAt: new Date().toISOString(),
        camera,
        snapshotUrl: snapshotUrl.trim() || undefined,
      });
      onCreated(detection);
    } catch (error) {
      onError(error instanceof Error ? error.message : "Could not create the detection.");
    } finally {
      setSubmitting(false);
    }
  }

  function applyDemo(index: number) {
    const demo = demoDetectionInputs[index] ?? demoDetectionInputs[0];
    setPlate(demo.plate);
    setCamera(demo.camera);
  }

  return (
      <form onSubmit={handleSubmit} className="demo-form">
        <label>
          <span>License Plate</span>
          <input value={plate} onChange={(event) => setPlate(event.target.value)} />
        </label>
        <label>
          <span>Camera</span>
          <input value={camera} onChange={(event) => setCamera(event.target.value)} />
        </label>
        <label>
          <span>Snapshot URL</span>
          <input
            value={snapshotUrl}
            onChange={(event) => setSnapshotUrl(event.target.value)}
            placeholder="https://..."
          />
        </label>
        <div className="demo-chips">
          {demoPlates.map((demoPlate, index) => (
            <button key={demoPlate} type="button" onClick={() => applyDemo(index)}>
              {demoPlate}
            </button>
          ))}
        </div>
        <button className="primary-button" type="submit" disabled={submitting}>
          <Play size={16} fill="currentColor" />
          {submitting ? "Saving" : "Simulate Detection"}
        </button>
      </form>
  );
}
