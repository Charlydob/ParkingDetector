import { Bell, BellOff, LogOut, Save } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "../../auth/AuthContext";
import { LOCALES, useI18n, type Locale } from "../../i18n";
import {
  getPushStatus,
  updateMyProfile,
  type PushStatus,
} from "../../services/backendApi";
import {
  activatePushDevice,
  browserSupportsWebPush,
  deactivatePushDevice,
  getCurrentBrowserSubscription,
  shouldShowIosInstallHint,
} from "../../services/pushClient";

function cleanDisplayName(value?: string | null) {
  return String(value || "").trim();
}

export function ProfilePage() {
  const { user, session, activeTenantId, logout, refreshSession } = useAuth();
  const { locale, setLocale, t } = useI18n();
  const [username, setUsername] = useState(user?.username || "");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState("");
  const [pushStatus, setPushStatus] = useState<PushStatus>();
  const [currentEndpoint, setCurrentEndpoint] = useState("");
  const membership = session?.memberships.find((item) => item.tenantId === activeTenantId);
  const activeTenant = session?.tenants.find((tenant) => tenant.id === activeTenantId);
  const role = membership?.role || (session?.isPlatformAdmin && activeTenantId ? "platform_admin" : "");
  const alias = cleanDisplayName(membership?.alias);
  const pushActive = Boolean(
    currentEndpoint &&
      pushStatus?.subscriptions.some(
        (subscription) => subscription.endpoint === currentEndpoint && !subscription.disabledAt,
      ),
  );

  const displayName = useMemo(
    () => alias || user?.username || user?.displayName || user?.email || "",
    [alias, user?.displayName, user?.email, user?.username],
  );

  const refreshPush = useCallback(async () => {
    if (!browserSupportsWebPush()) {
      setPushStatus(undefined);
      setCurrentEndpoint("");
      return;
    }
    const [status, subscription] = await Promise.all([
      getPushStatus(),
      getCurrentBrowserSubscription(),
    ]);
    setPushStatus(status);
    setCurrentEndpoint(subscription?.endpoint || "");
  }, []);

  useEffect(() => {
    setUsername(user?.username || "");
  }, [user?.username]);

  useEffect(() => {
    void refreshPush().catch(() => undefined);
  }, [refreshPush]);

  async function saveProfile() {
    setBusy("profile");
    setNotice("");
    try {
      await updateMyProfile({ username: username.trim() || null });
      await refreshSession();
      setNotice(t("saved"));
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not save profile.");
    } finally {
      setBusy("");
    }
  }

  async function toggleNotifications() {
    setBusy("push");
    setNotice("");
    try {
      if (pushActive) {
        await deactivatePushDevice();
      } else {
        await activatePushDevice();
      }
      await refreshPush();
      setNotice(t("saved"));
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not update notifications.");
    } finally {
      setBusy("");
    }
  }

  return (
    <section className="module-page profile-page">
      {notice && <div className={notice.includes("Could not") || notice.includes("must") ? "notice error" : "notice"}>{notice}</div>}
      <section className="panel profile-summary">
        <div className="profile-avatar" aria-hidden="true">{displayName.slice(0, 1).toUpperCase()}</div>
        <div>
          <h1>{displayName}</h1>
          <span>{activeTenant?.name || t("profile")}</span>
        </div>
      </section>

      <section className="panel">
        <div className="section-heading">
          <h2>{t("profile")}</h2>
        </div>
        <div className="settings-form">
          <label>
            <span>{t("username")}</span>
            <input value={username} onChange={(event) => setUsername(event.target.value)} placeholder="Charly" />
          </label>
          <div className="profile-meta-grid">
            <span>{t("email")}</span><strong>{user?.email}</strong>
            <span>{t("role")}</span><strong>{role || "-"}</strong>
            <span>{t("hotelAlias")}</span><strong>{alias || "-"}</strong>
          </div>
          <button type="button" onClick={() => void saveProfile()} disabled={busy !== ""}>
            <Save size={15} /> {t("save")}
          </button>
        </div>
      </section>

      <section className="panel">
        <div className="section-heading">
          <h2>{t("language")}</h2>
        </div>
        <div className="settings-form">
          <select value={locale} onChange={(event) => setLocale(event.target.value as Locale)}>
            {LOCALES.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
          </select>
        </div>
      </section>

      <section className="panel">
        <div className="section-heading">
          <h2>{t("notifications")}</h2>
          <span>{pushActive ? t("enabled") : t("disabled")}</span>
        </div>
        <div className="notification-body compact-notifications">
          {!browserSupportsWebPush() && shouldShowIosInstallHint() ? (
            <p>{t("activateNotifications")}</p>
          ) : !browserSupportsWebPush() ? (
            <p>Web Push unavailable.</p>
          ) : (
            <button type="button" onClick={() => void toggleNotifications()} disabled={busy !== ""}>
              {pushActive ? <BellOff size={16} /> : <Bell size={16} />}
              {pushActive ? t("deactivateNotifications") : t("activateNotifications")}
            </button>
          )}
        </div>
      </section>

      {user?.telegramUserId && (
        <details className="panel collapsible-panel">
          <summary>{t("legacyIntegrations")}</summary>
          <div className="settings-form">
            <strong>Telegram @{user.telegramUsername?.replace(/^@/, "") || user.telegramUserId}</strong>
          </div>
        </details>
      )}

      <button className="logout-button profile-logout" type="button" onClick={() => void logout()}>
        <LogOut size={16} /> {t("logout")}
      </button>
    </section>
  );
}
