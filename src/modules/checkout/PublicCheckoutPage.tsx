import { Html5Qrcode } from "html5-qrcode";
import { AlertCircle, CheckCircle2, QrCode } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { LOCALES, t, type Locale } from "../../i18n";
import {
  BackendRequestError,
  getPublicCheckoutTenant,
  resolvePublicCheckout,
  submitPublicCheckout,
  type PublicCheckoutTarget,
} from "../../services/backendApi";

type CheckoutState =
  | "loading"
  | "intro"
  | "scanning"
  | "identified"
  | "done"
  | "duplicate"
  | "invalid"
  | "inactive"
  | "error";

function slugFromPath() {
  const match = window.location.pathname.match(/^\/public\/([^/]+)\/checkout$/);
  return decodeURIComponent(match?.[1] || "");
}

function tokenFromPath() {
  const match = window.location.pathname.match(/^\/checkout\/([^/]+)$/);
  return decodeURIComponent(match?.[1] || "");
}

function tokenFromQrText(value: string) {
  const raw = value.trim();

  try {
    const parsed = new URL(raw, window.location.origin);
    const match = parsed.pathname.match(/^\/checkout\/([^/]+)$/);

    if (match) {
      return decodeURIComponent(match[1]);
    }
  } catch {
    return raw;
  }

  return raw;
}

export function PublicCheckoutPage() {
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const [locale, setLocale] = useState<Locale>("en");
  const [tenantName, setTenantName] = useState("");
  const [checkoutToken, setCheckoutToken] = useState(tokenFromPath());
  const [target, setTarget] = useState<PublicCheckoutTarget>();
  const [state, setState] = useState<CheckoutState>("loading");
  const [message, setMessage] = useState("");
  const isDirectCheckout = Boolean(tokenFromPath());

  function setPublicError(error: unknown) {
    if (error instanceof BackendRequestError) {
      if (error.code === "QR_DEACTIVATED") {
        setState("inactive");
        setMessage(t(locale, "deactivatedQr"));
        return;
      }

      if (error.code === "QR_INVALID") {
        setState("invalid");
        setMessage(t(locale, "invalidQr"));
        return;
      }
    }

    setState("error");
    setMessage(t(locale, "checkoutUnavailable"));
  }

  async function resolveToken(token: string) {
    const normalizedToken = tokenFromQrText(token);
    setCheckoutToken(normalizedToken);
    setState("loading");
    setMessage("");
    const nextTarget = await resolvePublicCheckout(normalizedToken);
    setTarget(nextTarget);
    setTenantName(nextTarget.tenant.name);
    setState("identified");
  }

  useEffect(() => {
    const directToken = tokenFromPath();

    if (directToken) {
      void resolveToken(directToken).catch(setPublicError);
    } else {
      void getPublicCheckoutTenant(slugFromPath())
        .then((tenant) => {
          setTenantName(tenant.tenantName);
          setState("intro");
        })
        .catch(setPublicError);
    }

    return () => {
      void scannerRef.current?.stop().catch(() => undefined);
    };
  }, []);

  async function handleToken(token: string) {
    await scannerRef.current?.stop().catch(() => undefined);
    scannerRef.current = null;
    await resolveToken(token);
  }

  async function startScanner() {
    setState("scanning");
    setMessage("");

    try {
      const scanner = new Html5Qrcode("checkout-qr-reader");
      scannerRef.current = scanner;
      await scanner.start(
        { facingMode: "environment" },
        { fps: 10, qrbox: { width: 240, height: 240 } },
        (decodedText) => void handleToken(decodedText).catch(setPublicError),
        () => undefined,
      );
    } catch (error) {
      setState("error");
      setMessage(error instanceof Error ? error.message : t(locale, "cameraError"));
    }
  }

  async function confirmCheckout() {
    try {
      const result = await submitPublicCheckout(checkoutToken, target?.attemptToken || "");
      setState(result.duplicate ? "duplicate" : "done");
      setMessage(result.duplicate ? t(locale, "duplicate") : t(locale, "completedBody"));
    } catch (error) {
      setPublicError(error);
    }
  }

  return (
    <main className="public-checkout-shell">
      <section className="public-checkout-panel">
        <div className="public-checkout-topline">
          <div className="public-checkout-brand">{t(locale, "appName")}</div>
          <label>
            <span>{t(locale, "language")}</span>
            <select value={locale} onChange={(event) => setLocale(event.target.value as Locale)}>
              {LOCALES.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <h1>{target ? t(locale, "readyTitle") : t(locale, "checkOut")}</h1>
        <p>{tenantName || t(locale, "hotelCheckout")}</p>

        {state === "loading" && <p>{isDirectCheckout ? t(locale, "readyTitle") : t(locale, "hotelCheckout")}</p>}

        {(state === "intro" || state === "scanning") && (
          <>
            <p>{t(locale, "scanInstruction")}</p>
            <div
              id="checkout-qr-reader"
              className={state === "scanning" ? "qr-reader active" : "qr-reader"}
            />
            <button
              className="primary-button"
              type="button"
              onClick={() => void startScanner()}
              disabled={state === "scanning"}
            >
              <QrCode size={18} />
              {state === "scanning" ? t(locale, "scanning") : t(locale, "scanKey")}
            </button>
          </>
        )}

        {state === "identified" && target && (
          <div className="checkout-confirmation">
            <strong>
              {t(locale, "room")} {target.room.number}
            </strong>
            <p>{t(locale, "readyBody")}</p>
            <button className="primary-button" type="button" onClick={() => void confirmCheckout()}>
              <CheckCircle2 size={18} />
              {t(locale, "confirmCheckout")}
            </button>
          </div>
        )}

        {(state === "done" || state === "duplicate") && (
          <div className="checkout-success">
            <CheckCircle2 size={46} />
            <strong>{state === "done" ? t(locale, "completed") : t(locale, "duplicate")}</strong>
            <p>{message}</p>
          </div>
        )}

        {(state === "invalid" || state === "inactive" || state === "error") && (
          <div className="checkout-error-state">
            <AlertCircle size={42} />
            <strong>{message || t(locale, "networkError")}</strong>
          </div>
        )}
      </section>
    </main>
  );
}
