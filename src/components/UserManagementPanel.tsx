import { Ban, Copy, RefreshCw, RotateCw, UserPlus } from "lucide-react";
import { useState, type FormEvent } from "react";
import type { TenantMember, UserInvitation } from "../types/tenant";
import type { TenantRole } from "../types/modules";

interface UserManagementPanelProps {
  members: TenantMember[];
  invitations: UserInvitation[];
  compact?: boolean;
  onInvite: (input: { email: string; role: TenantRole }) => Promise<UserInvitation>;
  onChangeRole: (membershipId: string, role: TenantRole) => Promise<void>;
  onRevokeMember: (membershipId: string) => Promise<void>;
  onGetInvitationLink: (invitationId: string) => Promise<{ inviteUrl: string }>;
  onRevokeInvitation: (invitationId: string) => Promise<void>;
  onRegenerateInvitation: (invitationId: string) => Promise<UserInvitation>;
  onRefresh?: () => Promise<void>;
  onNotice?: (message: string) => void;
}

function formatDate(value?: string | null) {
  return value ? new Date(value).toLocaleString() : "-";
}

async function copyText(text: string) {
  await navigator.clipboard.writeText(text);
}

export function UserManagementPanel({
  members,
  invitations,
  compact,
  onInvite,
  onChangeRole,
  onRevokeMember,
  onGetInvitationLink,
  onRevokeInvitation,
  onRegenerateInvitation,
  onRefresh,
  onNotice,
}: UserManagementPanelProps) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<TenantRole>("staff");
  const [busy, setBusy] = useState("");
  const [localNotice, setLocalNotice] = useState("");

  function notify(message: string) {
    setLocalNotice(message);
    onNotice?.(message);
  }

  async function run(action: string, work: () => Promise<void>) {
    setBusy(action);
    setLocalNotice("");
    try {
      await work();
      await onRefresh?.();
    } catch (error) {
      notify(error instanceof Error ? error.message : "Action failed.");
    } finally {
      setBusy("");
    }
  }

  async function submitInvite(event: FormEvent) {
    event.preventDefault();
    await run("invite", async () => {
      const invitation = await onInvite({ email, role });
      setEmail("");
      setRole("staff");
      if (invitation.inviteUrl) {
        try {
          await copyText(invitation.inviteUrl);
          notify("Invitation created and link copied.");
        } catch {
          notify("Invitation created. Use Copy to copy the link.");
        }
      } else {
        notify("Invitation created.");
      }
    });
  }

  async function copyInvitationLink(invitationId: string) {
    await run(`copy-${invitationId}`, async () => {
      const link = await onGetInvitationLink(invitationId);
      await copyText(link.inviteUrl);
      notify("Invitation link copied.");
    });
  }

  async function regenerateInvitation(invitationId: string) {
    await run(`regenerate-${invitationId}`, async () => {
      const invitation = await onRegenerateInvitation(invitationId);
      if (invitation.inviteUrl) {
        await copyText(invitation.inviteUrl);
      }
      notify("Invitation regenerated.");
    });
  }

  return (
    <div className={compact ? "user-management compact" : "user-management"}>
      {localNotice && <div className={localNotice.includes("failed") ? "notice error" : "notice"}>{localNotice}</div>}

      <form className="settings-form compact-form" onSubmit={submitInvite}>
        <div className="settings-split">
          <label>
            <span>Email</span>
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </label>
          <label>
            <span>Role</span>
            <select value={role} onChange={(event) => setRole(event.target.value as TenantRole)}>
              <option value="staff">Staff</option>
              <option value="manager">Manager</option>
              <option value="tenant_admin">Tenant admin</option>
            </select>
          </label>
        </div>
        <div className="button-row">
          <button type="submit" disabled={busy !== "" || !email.trim()}>
            <UserPlus size={15} />
            Invite user
          </button>
          {onRefresh && (
            <button type="button" onClick={() => void run("refresh", onRefresh)} disabled={busy !== ""}>
              <RefreshCw size={15} />
              Refresh
            </button>
          )}
        </div>
      </form>

      <div className="user-management-block">
        <div className="section-heading inline">
          <h2>Users</h2>
          <span>{members.length}</span>
        </div>
        <div className="user-table">
          <div className="user-table-head">
            <span>Email</span>
            <span>Name</span>
            <span>Role</span>
            <span>Status</span>
            <span>Actions</span>
          </div>
          {members.length ? (
            members.map((member) => (
              <div key={member.id} className="user-row">
                <span>{member.user.email || member.userId}</span>
                <span>{member.user.displayName || "-"}</span>
                <select
                  value={member.role}
                  onChange={(event) =>
                    void run(`role-${member.id}`, () =>
                      onChangeRole(member.id, event.target.value as TenantRole),
                    )
                  }
                  disabled={busy !== ""}
                >
                  <option value="staff">Staff</option>
                  <option value="manager">Manager</option>
                  <option value="tenant_admin">Tenant admin</option>
                </select>
                <span>{member.status}</span>
                <button
                  type="button"
                  onClick={() => void run(`revoke-member-${member.id}`, () => onRevokeMember(member.id))}
                  disabled={busy !== ""}
                >
                  <Ban size={14} />
                  Revoke
                </button>
              </div>
            ))
          ) : (
            <div className="empty-state">No users</div>
          )}
        </div>
      </div>

      <div className="user-management-block">
        <div className="section-heading inline">
          <h2>Pending invitations</h2>
          <span>{invitations.length}</span>
        </div>
        <div className="invite-table">
          <div className="invite-table-head">
            <span>Email</span>
            <span>Role</span>
            <span>Created</span>
            <span>Expires</span>
            <span>Status</span>
            <span>Actions</span>
          </div>
          {invitations.length ? (
            invitations.map((invitation) => (
              <div key={invitation.id} className="invite-row">
                <span>{invitation.email}</span>
                <span>{invitation.role}</span>
                <span>{formatDate(invitation.createdAt)}</span>
                <span>{formatDate(invitation.expiresAt)}</span>
                <span>{invitation.status}</span>
                <div className="button-row">
                  <button
                    type="button"
                    onClick={() => void copyInvitationLink(invitation.id)}
                    disabled={busy !== "" || invitation.status !== "pending"}
                  >
                    <Copy size={14} />
                    Copy
                  </button>
                  <button
                    type="button"
                    onClick={() => void run(`revoke-invite-${invitation.id}`, () => onRevokeInvitation(invitation.id))}
                    disabled={busy !== "" || invitation.status !== "pending"}
                  >
                    <Ban size={14} />
                    Revoke
                  </button>
                  <button
                    type="button"
                    onClick={() => void regenerateInvitation(invitation.id)}
                    disabled={busy !== "" || invitation.status === "used"}
                  >
                    <RotateCw size={14} />
                    Regenerate
                  </button>
                </div>
              </div>
            ))
          ) : (
            <div className="empty-state">No pending invitations</div>
          )}
        </div>
      </div>
    </div>
  );
}
