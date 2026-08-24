import { ExternalLink, FlaskConical, Plus, RefreshCw, Save } from "lucide-react";
import { useEffect, useState } from "react";
import { UserManagementPanel } from "../../components/UserManagementPanel";
import {
  createTenant,
  createAdminTenantInvitation,
  getAdminTenantInvitationLink,
  getAdminTenants,
  regenerateAdminTenantInvitation,
  revokeAdminTenantInvitation,
  revokeAdminTenantMembership,
  setAdminTenantModule,
  updateAdminTenant,
  updateAdminTenantMembershipRole,
  type AdminTenantSummary,
} from "../../services/backendApi";
import { MODULE_REGISTRY, type ModuleId } from "../../types/modules";

export function AdminPage() {
  const [tenants, setTenants] = useState<AdminTenantSummary[]>([]);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [notice, setNotice] = useState("");

  async function reload() {
    setTenants(await getAdminTenants());
  }

  useEffect(() => {
    void reload().catch((error) =>
      setNotice(error instanceof Error ? error.message : "Could not load tenants."),
    );
  }, []);

  async function addTenant() {
    await createTenant({
      name,
      slug,
      modules: {
        parking: true,
        checkout: true,
      },
    });
    setName("");
    setSlug("");
    setNotice("Tenant created.");
    await reload();
  }

  async function addDemoTenant() {
    const suffix = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    await createTenant({
      name: "Demo Hotel",
      slug: `demo-hotel-${suffix}`,
      modules: {
        parking: true,
        checkout: true,
      },
    });
    setNotice("Demo tenant created.");
    await reload();
  }

  async function toggleModule(tenant: AdminTenantSummary, moduleId: ModuleId) {
    await setAdminTenantModule(tenant.id, moduleId, !tenant.modules[moduleId]);
    await reload();
  }

  function openHotel(tenant: AdminTenantSummary) {
    window.open(`/t/${encodeURIComponent(tenant.slug)}/dashboard`, "_blank", "noopener,noreferrer");
  }

  function openHotelIntegrations(tenant: AdminTenantSummary) {
    window.open(
      `/t/${encodeURIComponent(tenant.slug)}/integrations`,
      "_blank",
      "noopener,noreferrer",
    );
  }

  return (
    <section className="module-page">
      <div className="module-title">
        <div>
          <h1>Platform Admin</h1>
          <p>Tenants, users and enabled modules.</p>
        </div>
        <button type="button" onClick={() => void reload()}>
          <RefreshCw size={15} />
          Refresh
        </button>
      </div>

      {notice && (
        <div className={notice.includes("Could not") ? "notice error" : "notice"}>
          {notice}
        </div>
      )}

      <section className="panel">
        <div className="section-heading">
          <h2>Create tenant</h2>
        </div>
        <div className="settings-form">
          <div className="settings-split">
            <label>
              <span>Name</span>
              <input value={name} onChange={(event) => setName(event.target.value)} />
            </label>
            <label>
              <span>Slug</span>
              <input value={slug} onChange={(event) => setSlug(event.target.value)} />
            </label>
          </div>
          <div className="button-row">
            <button type="button" onClick={addTenant} disabled={!name.trim()}>
              <Plus size={15} />
              Create tenant
            </button>
            <button type="button" onClick={addDemoTenant}>
              <FlaskConical size={15} />
              Add demo tenant
            </button>
          </div>
        </div>
      </section>

      <section className="panel">
        <div className="section-heading">
          <h2>Tenants</h2>
          <span>{tenants.length}</span>
        </div>
        <div className="tenant-table">
          <div className="tenant-table-head">
            <span>Hotel</span>
            <span>Status / settings</span>
            <span>Users</span>
            <span>Created</span>
            <span>Modules</span>
          </div>
          {tenants.map((tenant) => (
            <article key={tenant.id} className="tenant-row">
              <div>
                <strong>{tenant.name}</strong>
                <span>{tenant.slug}</span>
                <div className="button-row compact-actions">
                  <button type="button" onClick={() => openHotel(tenant)}>
                    <ExternalLink size={15} />
                    Open hotel
                  </button>
                  <button type="button" onClick={() => openHotelIntegrations(tenant)}>
                    <ExternalLink size={15} />
                    Integrations
                  </button>
                </div>
              </div>
              <TenantSummary tenant={tenant} onReload={reload} onNotice={setNotice} />
              <TenantUsers tenant={tenant} onReload={reload} onNotice={setNotice} />
              <span>{new Date(tenant.createdAt).toLocaleDateString()}</span>
              <div className="module-toggle-list">
                {MODULE_REGISTRY.map((module) => (
                  <button
                    key={module.id}
                    type="button"
                    className={tenant.modules[module.id] ? "active" : ""}
                    onClick={() => toggleModule(tenant, module.id)}
                  >
                    {module.label} {tenant.modules[module.id] ? "ON" : "OFF"}
                  </button>
                ))}
              </div>
            </article>
          ))}
        </div>
      </section>
    </section>
  );
}

function TenantSummary({
  tenant,
  onReload,
  onNotice,
}: {
  tenant: AdminTenantSummary;
  onReload: () => Promise<void>;
  onNotice: (message: string) => void;
}) {
  const [name, setName] = useState(tenant.name);
  const [slug, setSlug] = useState(tenant.slug);
  const [active, setActive] = useState(tenant.active);
  const [displayName, setDisplayName] = useState(
    tenant.basicInfo?.displayName || tenant.name,
  );

  async function saveTenant() {
    await updateAdminTenant(tenant.id, {
      name,
      slug,
      active,
      basicInfo: {
        ...(tenant.basicInfo || {}),
        displayName,
      },
    });
    onNotice("Tenant updated.");
    await onReload();
  }

  return (
    <div className="tenant-summary">
      <strong>{tenant.active ? "Active" : "Inactive"}</strong>
      <label>
        <span>Name</span>
        <input value={name} onChange={(event) => setName(event.target.value)} />
      </label>
      <label>
        <span>Slug</span>
        <input value={slug} onChange={(event) => setSlug(event.target.value)} />
      </label>
      <label>
        <span>Visible name</span>
        <input value={displayName} onChange={(event) => setDisplayName(event.target.value)} />
      </label>
      <label className="checkbox-row">
        <input
          type="checkbox"
          checked={active}
          onChange={(event) => setActive(event.target.checked)}
        />
        <span>Active</span>
      </label>
      <button type="button" onClick={() => void saveTenant()}>
        <Save size={15} />
        Save
      </button>
      <span>Reservations: {tenant.settingsSummary.reservationSource}</span>
      <span>Frigate: {tenant.settingsSummary.frigateBaseUrl || "-"}</span>
      <span>Stripe: {tenant.settingsSummary.stripeConnected ? "Connected" : "Off"}</span>
      <span>Telegram: {tenant.settingsSummary.telegramEnabled ? "On" : "Off"}</span>
      <span>
        Rooms: {tenant.settingsSummary.rooms} - Keys: {tenant.settingsSummary.keys}
      </span>
    </div>
  );
}

function TenantUsers({
  tenant,
  onReload,
  onNotice,
}: {
  tenant: AdminTenantSummary;
  onReload: () => Promise<void>;
  onNotice: (message: string) => void;
}) {
  return (
    <UserManagementPanel
      compact
      members={tenant.users}
      invitations={tenant.invitations || []}
      onInvite={(input) => createAdminTenantInvitation(tenant.id, input)}
      onChangeRole={(membershipId, role) =>
        updateAdminTenantMembershipRole(tenant.id, membershipId, role).then(() => undefined)
      }
      onRevokeMember={(membershipId) =>
        revokeAdminTenantMembership(tenant.id, membershipId).then(() => undefined)
      }
      onGetInvitationLink={(invitationId) => getAdminTenantInvitationLink(tenant.id, invitationId)}
      onRevokeInvitation={(invitationId) =>
        revokeAdminTenantInvitation(tenant.id, invitationId).then(() => undefined)
      }
      onRegenerateInvitation={(invitationId) =>
        regenerateAdminTenantInvitation(tenant.id, invitationId)
      }
      onRefresh={onReload}
      onNotice={onNotice}
    />
  );
}
