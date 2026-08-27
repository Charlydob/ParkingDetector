import { useEffect, useState } from "react";
import { UserManagementPanel } from "../../components/UserManagementPanel";
import {
  createTenantInvitation,
  getTenantInvitationLink,
  getTenantUsers,
  regenerateTenantInvitation,
  revokeTenantInvitation,
  revokeTenantMembership,
  updateTenantMembershipAlias,
  updateTenantMembershipRole,
} from "../../services/backendApi";
import type { TenantMember, UserInvitation } from "../../types/tenant";

export function TenantUsersPage() {
  const [members, setMembers] = useState<TenantMember[]>([]);
  const [invitations, setInvitations] = useState<UserInvitation[]>([]);
  const [notice, setNotice] = useState("");

  async function reload() {
    const payload = await getTenantUsers();
    setMembers(payload.members);
    setInvitations(payload.invitations);
  }

  useEffect(() => {
    void reload().catch((error) =>
      setNotice(error instanceof Error ? error.message : "Could not load users."),
    );
  }, []);

  return (
    <section className="module-page">
      <div className="module-title">
        <div>
          <h1>Users</h1>
          <p>Manage hotel access for the active tenant.</p>
        </div>
      </div>

      {notice && <div className={notice.includes("Could not") ? "notice error" : "notice"}>{notice}</div>}

      <section className="panel">
        <UserManagementPanel
          members={members}
          invitations={invitations}
          onInvite={createTenantInvitation}
          onChangeRole={(membershipId, role) =>
            updateTenantMembershipRole(membershipId, role).then(() => undefined)
          }
          onChangeAlias={(membershipId, alias) =>
            updateTenantMembershipAlias(membershipId, alias).then(() => undefined)
          }
          onRevokeMember={(membershipId) =>
            revokeTenantMembership(membershipId).then(() => undefined)
          }
          onGetInvitationLink={getTenantInvitationLink}
          onRevokeInvitation={(invitationId) =>
            revokeTenantInvitation(invitationId).then(() => undefined)
          }
          onRegenerateInvitation={regenerateTenantInvitation}
          onRefresh={reload}
          onNotice={setNotice}
        />
      </section>
    </section>
  );
}
