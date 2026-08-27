import type { GlobalRole, ModuleDefinition, ModuleId, TenantRole } from "./modules";

export interface Tenant {
  id: string;
  name: string;
  slug: string;
  active: boolean;
  basicInfo?: {
    displayName?: string;
    address?: string;
    contactEmail?: string;
    phone?: string;
    timezone?: string;
  };
  createdAt: string;
  updatedAt?: string;
}

export interface UserProfile {
  id: string;
  email: string;
  displayName?: string;
  globalRole?: GlobalRole;
  telegramUserId?: string | null;
  telegramUsername?: string | null;
  telegramLinkedAt?: string | null;
  createdAt: string;
  updatedAt?: string;
}

export interface TenantMembership {
  id: string;
  tenantId: string;
  userId: string;
  role: TenantRole;
  createdAt: string;
  updatedAt?: string;
}

export interface TenantMember extends TenantMembership {
  status: "active";
  user: Pick<UserProfile, "id" | "email" | "displayName" | "telegramUserId" | "telegramUsername" | "telegramLinkedAt">;
}

export interface UserInvitation {
  id: string;
  email: string;
  tenantId: string;
  tenantName?: string;
  role: TenantRole;
  invitedByUserId: string;
  createdAt: string;
  expiresAt: string;
  usedAt?: string | null;
  revokedAt?: string | null;
  status: "pending" | "used" | "expired" | "revoked";
  inviteUrl?: string;
}

export interface TenantModule {
  tenantId: string;
  moduleId: ModuleId;
  enabled: boolean;
  updatedAt: string;
}

export interface AuthSession {
  user: UserProfile;
  memberships: TenantMembership[];
  tenants: Tenant[];
  modules: Array<ModuleDefinition & { enabled: boolean }>;
  modulesByTenant: Record<string, Record<ModuleId, boolean>>;
  activeTenantId?: string;
  isPlatformAdmin: boolean;
}
