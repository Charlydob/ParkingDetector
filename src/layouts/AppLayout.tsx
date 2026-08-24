import {
  Building2,
  CarFront,
  ClipboardCheck,
  ArrowLeft,
  Home,
  LogOut,
  Settings,
  Shield,
  Users,
  Wrench,
} from "lucide-react";
import type { ReactNode } from "react";
import { APP_NAME } from "../config/app";
import { MODULE_REGISTRY, type ModuleId } from "../types/modules";
import { useAuth } from "../auth/AuthContext";

export type AppRoute =
  | "dashboard"
  | "parking"
  | "checkout"
  | "reservations"
  | "integrations"
  | "settings"
  | "users"
  | "admin";

interface AppLayoutProps {
  route: AppRoute;
  onRouteChange: (route: AppRoute) => void;
  enabledModules: Record<ModuleId, boolean>;
  children: ReactNode;
}

const routeIcons = {
  dashboard: Home,
  parking: CarFront,
  checkout: ClipboardCheck,
  reservations: Building2,
  integrations: Wrench,
  settings: Settings,
  users: Users,
  admin: Shield,
};

export function AppLayout({ route, onRouteChange, enabledModules, children }: AppLayoutProps) {
  const { session, activeTenantId, selectTenant, logout } = useAuth();
  const enabled = MODULE_REGISTRY.filter((module) => enabledModules[module.id] && module.implemented);
  const activeTenant = session?.tenants.find((tenant) => tenant.id === activeTenantId);
  const activeTenantRole = session?.memberships.find(
    (membership) => membership.tenantId === activeTenantId,
  )?.role || (session?.isPlatformAdmin && activeTenantId ? "platform_admin" : undefined);
  const canConfigureTenant =
    activeTenantRole === "tenant_admin" || activeTenantRole === "platform_admin";

  function navButton(target: AppRoute, label: string) {
    const Icon = routeIcons[target];
    return (
      <button
        key={target}
        type="button"
        className={route === target ? "active" : ""}
        onClick={() => onRouteChange(target)}
      >
        <Icon size={17} />
        {label}
      </button>
    );
  }

  async function handleTenantChange(tenantId: string) {
    const tenant = session?.tenants.find((candidate) => candidate.id === tenantId);
    await selectTenant(tenantId || undefined);

    if (!tenantId) {
      window.history.pushState({}, "", "/admin");
      onRouteChange("admin");
      return;
    }

    const nextRoute = route === "admin" ? "dashboard" : route;
    const path =
      nextRoute === "dashboard"
        ? `/t/${encodeURIComponent(tenant?.slug || tenantId)}`
        : nextRoute === "users"
          ? `/t/${encodeURIComponent(tenant?.slug || tenantId)}/settings/users`
          : `/t/${encodeURIComponent(tenant?.slug || tenantId)}/${nextRoute}`;
    window.history.pushState({}, "", path);
    onRouteChange(nextRoute);
  }

  return (
    <div className="platform-shell">
      <aside className="sidebar">
        <div className="sidebar-brand">
          <strong>{APP_NAME}</strong>
          <span>{session?.user.email}</span>
        </div>
        {session?.tenants.length ? (
          <label className="tenant-picker">
            <span>Tenant</span>
            <select
              value={activeTenantId || ""}
              onChange={(event) => void handleTenantChange(event.target.value)}
            >
              {session.isPlatformAdmin && <option value="">Admin only</option>}
              {session.tenants.map((tenant) => (
                <option key={tenant.id} value={tenant.id}>
                  {tenant.name}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <div className="tenant-empty">
            <span>Tenant</span>
            <strong>No tenant selected</strong>
          </div>
        )}
        <nav className="sidebar-nav" aria-label="Application navigation">
          {activeTenantId && (
            <>
              {navButton("dashboard", "Dashboard")}
              <span>Operations</span>
              {enabled.some((module) => module.id === "parking") && navButton("parking", "Parking")}
              {enabled.some((module) => module.id === "checkout") && navButton("checkout", "Checkout")}
              {canConfigureTenant && (
                <>
                  <span>Management</span>
                  {navButton("reservations", "Reservations")}
                  <span>System</span>
                  {navButton("integrations", "Integrations")}
                  {navButton("settings", "Settings")}
                  {navButton("users", "Users")}
                </>
              )}
            </>
          )}
          {session?.isPlatformAdmin && (
            <>
              <span>Admin</span>
              {navButton("admin", "Platform Admin")}
            </>
          )}
        </nav>
        <button className="logout-button" type="button" onClick={() => void logout()}>
          <LogOut size={16} />
          Logout
        </button>
      </aside>
      <main className="platform-main">
        {session?.isPlatformAdmin && activeTenantId && (
          <div className="support-mode-banner">
            <strong>Support mode - {activeTenant?.name || activeTenantId}</strong>
            <button type="button" onClick={() => void handleTenantChange("")}>
              <ArrowLeft size={15} />
              Back to Platform Admin
            </button>
          </div>
        )}
        {children}
      </main>
    </div>
  );
}
