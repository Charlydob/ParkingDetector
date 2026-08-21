import { ChevronDown, ChevronRight, LogIn, Wrench } from "lucide-react";
import { useState } from "react";
import { simulateCheckIn } from "../services/backendApi";
import type { Detection } from "../types/detection";
import { DemoDetectionForm } from "./DemoDetectionForm";

interface TestingToolsProps {
  onDetectionCreated: (detection: Detection) => void;
  onNotice: (message: string) => void;
}

export function TestingTools({ onDetectionCreated, onNotice }: TestingToolsProps) {
  const [open, setOpen] = useState(false);
  const [reservationCode, setReservationCode] = useState("R-1002");
  const [fullName, setFullName] = useState("Mara Hoffman");
  const [submitting, setSubmitting] = useState(false);

  async function handleCheckIn(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!reservationCode.trim() || !fullName.trim()) {
      onNotice("Enter a reservation number and guest name.");
      return;
    }

    setSubmitting(true);
    try {
      await simulateCheckIn(reservationCode, fullName);
      onNotice(`Check-in ${reservationCode} simulated.`);
    } catch (error) {
      onNotice(error instanceof Error ? error.message : "Could not simulate check-in.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="panel testing-tools">
      <button
        className="section-heading disclosure-heading"
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
      >
        <span className="heading-title">
          <Wrench size={17} />
          Testing Tools
        </span>
        {open ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
      </button>

      {open && (
        <div className="testing-body">
          <div className="tool-block">
            <h3>Simulate Detection</h3>
            <DemoDetectionForm onCreated={onDetectionCreated} onError={onNotice} />
          </div>
          <div className="tool-block">
            <h3>Simulate Check-In</h3>
            <form className="demo-form compact-form" onSubmit={handleCheckIn}>
              <label>
                <span>Reservation Number</span>
                <input
                  value={reservationCode}
                  onChange={(event) => setReservationCode(event.target.value)}
                />
              </label>
              <label>
                <span>Full Name</span>
                <input value={fullName} onChange={(event) => setFullName(event.target.value)} />
              </label>
              <button className="primary-button" type="submit" disabled={submitting}>
                <LogIn size={16} />
                {submitting ? "Saving" : "Simulate Check-In"}
              </button>
            </form>
          </div>
        </div>
      )}
    </section>
  );
}
