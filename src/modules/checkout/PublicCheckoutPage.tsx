import { Html5Qrcode } from "html5-qrcode";
import { CheckCircle2, QrCode } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { APP_NAME } from "../../config/app";
import { getPublicCheckoutTenant, submitPublicCheckout } from "../../services/backendApi";

function slugFromPath() {
  const match = window.location.pathname.match(/^\/public\/([^/]+)\/checkout$/);
  return decodeURIComponent(match?.[1] || "");
}

export function PublicCheckoutPage() {
  const slug = slugFromPath();
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const [tenantName, setTenantName] = useState("");
  const [state, setState] = useState<"intro" | "scanning" | "done" | "error">("intro");
  const [message, setMessage] = useState("");

  useEffect(() => {
    void getPublicCheckoutTenant(slug)
      .then((tenant) => setTenantName(tenant.tenantName))
      .catch((error) => {
        setState("error");
        setMessage(error instanceof Error ? error.message : "Checkout is not available.");
      });

    return () => {
      void scannerRef.current?.stop().catch(() => undefined);
    };
  }, [slug]);

  async function handleToken(token: string) {
    try {
      await scannerRef.current?.stop().catch(() => undefined);
      const result = await submitPublicCheckout(token);
      setState("done");
      setMessage(
        result.duplicate
          ? "Checkout already received. You can leave your key at reception."
          : "Checkout completed. You can leave your key at reception.",
      );
    } catch (error) {
      setState("error");
      setMessage(error instanceof Error ? error.message : "Could not complete checkout.");
    }
  }

  async function startScanner() {
    setState("scanning");
    setMessage("");
    const scanner = new Html5Qrcode("checkout-qr-reader");
    scannerRef.current = scanner;
    await scanner.start(
      { facingMode: "environment" },
      { fps: 10, qrbox: { width: 240, height: 240 } },
      (decodedText) => void handleToken(decodedText),
      () => undefined,
    );
  }

  return (
    <main className="public-checkout-shell">
      <section className="public-checkout-panel">
        <div className="public-checkout-brand">{APP_NAME}</div>
        <h1>Check out</h1>
        <p>{tenantName || "Hotel checkout"}</p>

        {state === "done" ? (
          <div className="checkout-success">
            <CheckCircle2 size={46} />
            <strong>{message}</strong>
          </div>
        ) : (
          <>
            <p>Scan the QR code on the back of your key.</p>
            <div id="checkout-qr-reader" className={state === "scanning" ? "qr-reader active" : "qr-reader"} />
            <button className="primary-button" type="button" onClick={startScanner} disabled={state === "scanning"}>
              <QrCode size={18} />
              Scan key
            </button>
          </>
        )}

        {state === "error" && <div className="notice error">{message}</div>}
      </section>
    </main>
  );
}
