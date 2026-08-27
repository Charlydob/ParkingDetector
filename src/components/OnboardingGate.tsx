import { Bell, CheckCircle2 } from "lucide-react";
import { useState, type ReactNode } from "react";
import { useI18n } from "../i18n";
import { activatePushDevice, appIsStandalone, browserSupportsWebPush } from "../services/pushClient";

const ONBOARDING_KEY = "hotelapp.deviceOnboardingComplete";

export function OnboardingGate({ children }: { children: ReactNode }) {
  const { t } = useI18n();
  const shouldOffer = appIsStandalone() && localStorage.getItem(ONBOARDING_KEY) !== "true";
  const [step, setStep] = useState(shouldOffer ? 0 : 3);
  const [busy, setBusy] = useState(false);

  function finish() {
    localStorage.setItem(ONBOARDING_KEY, "true");
    setStep(3);
  }

  async function enableNotifications() {
    setBusy(true);
    try {
      if (browserSupportsWebPush()) {
        await activatePushDevice();
      }
    } catch {
      // Notification consent is optional; the app remains usable.
    } finally {
      setBusy(false);
      setStep(2);
    }
  }

  if (step >= 3) {
    return <>{children}</>;
  }

  return (
    <>
      {children}
      <div className="onboarding-backdrop">
        <section className="onboarding-sheet" aria-live="polite">
          {step === 0 && (
            <>
              <h2>{t("welcomeTitle")}</h2>
              <button className="primary-button" type="button" onClick={() => setStep(1)}>
                {t("continue")}
              </button>
            </>
          )}
          {step === 1 && (
            <>
              <Bell size={30} />
              <h2>{t("enableNotificationsTitle")}</h2>
              <p>{t("enableNotificationsBody")}</p>
              <button className="primary-button" type="button" onClick={() => void enableNotifications()} disabled={busy}>
                {busy ? t("continue") : t("activateNotifications")}
              </button>
              <button type="button" onClick={() => setStep(2)}>{t("skip")}</button>
            </>
          )}
          {step === 2 && (
            <>
              <CheckCircle2 size={34} />
              <h2>{t("allSet")}</h2>
              <button className="primary-button" type="button" onClick={finish}>
                {t("start")}
              </button>
            </>
          )}
        </section>
      </div>
    </>
  );
}
