import { CreditCard } from "lucide-react";
import { useState } from "react";
import { simulateCheckIn, type CheckInResult } from "../services/backendApi";

interface CheckInDemoFormProps {
  compact?: boolean;
}

function formatTime(value: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(new Date(value));
}

export function CheckInDemoForm({ compact = false }: CheckInDemoFormProps) {
  const [reservationCode, setReservationCode] = useState("");
  const [fullName, setFullName] = useState("");
  const [result, setResult] = useState<CheckInResult>();
  const [resultGuestName, setResultGuestName] = useState("");
  const [error, setError] = useState("");
  const [processing, setProcessing] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!reservationCode.trim() || !fullName.trim()) {
      setError("Reservation Number and Full Name are required.");
      return;
    }

    setProcessing(true);
    setError("");
    const submittedFullName = fullName.trim();

    try {
      const checkIn = await simulateCheckIn(reservationCode.trim(), submittedFullName);
      setResult(checkIn);
      setResultGuestName(submittedFullName);
      setReservationCode("");
      setFullName("");
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Payment failed.");
    } finally {
      setProcessing(false);
    }
  }

  return (
    <div className={compact ? "checkin-demo-content compact" : "checkin-demo-content"}>
      <div className="checkin-demo-heading">
        <CreditCard size={28} />
        <div>
          <h1>Check-In Process</h1>
          {!compact && <p>Complete guest payment</p>}
        </div>
      </div>

      <form className="checkin-demo-form" onSubmit={handleSubmit}>
        <label>
          <span>Reservation Number</span>
          <input
            value={reservationCode}
            onChange={(event) => setReservationCode(event.target.value)}
            autoComplete="off"
          />
        </label>
        <label>
          <span>Full Name</span>
          <input
            value={fullName}
            onChange={(event) => setFullName(event.target.value)}
            autoComplete="name"
          />
        </label>

        <div className="payment-section">
          <h2>Payment</h2>
          <button className="primary-button" type="submit" disabled={processing}>
            {processing ? "Processing payment..." : "Pay"}
          </button>
        </div>
      </form>

      {result && (
        <div className="checkin-result">
          <strong>Payment completed</strong>
          <span>Check-in registered</span>
          <dl>
            <div>
              <dt>Reservation</dt>
              <dd>{result.reservationCode}</dd>
            </div>
            <div>
              <dt>Guest</dt>
              <dd>{resultGuestName}</dd>
            </div>
            <div>
              <dt>Check-in time</dt>
              <dd>{formatTime(result.checkInAt)}</dd>
            </div>
          </dl>
        </div>
      )}

      {error && <div className="checkin-error">{error}</div>}
    </div>
  );
}

export function CheckInDemoPage() {
  return (
    <main className="checkin-demo-shell">
      <section className="checkin-demo-card">
        <CheckInDemoForm />
      </section>
    </main>
  );
}
