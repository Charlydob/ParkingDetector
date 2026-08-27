export const HOUSEKEEPING_ROLES = Object.freeze({
  PLATFORM_ADMIN: "platform_admin",
  TENANT_ADMIN: "tenant_admin",
  MANAGER: "manager",
  STAFF: "staff",
});

const MEMBER_ROLES = new Set([
  HOUSEKEEPING_ROLES.TENANT_ADMIN,
  HOUSEKEEPING_ROLES.MANAGER,
  HOUSEKEEPING_ROLES.STAFF,
]);

export function canUseHousekeeping(role) {
  return role === HOUSEKEEPING_ROLES.PLATFORM_ADMIN || MEMBER_ROLES.has(role);
}

export function canManageHousekeeping(role) {
  return [
    HOUSEKEEPING_ROLES.PLATFORM_ADMIN,
    HOUSEKEEPING_ROLES.TENANT_ADMIN,
    HOUSEKEEPING_ROLES.MANAGER,
  ].includes(role);
}

export function requireHousekeepingPermission(role, permission = "use") {
  const allowed = permission === "manage" ? canManageHousekeeping(role) : canUseHousekeeping(role);
  if (!allowed) {
    const error = new Error(
      permission === "manage"
        ? "Manager access is required for this housekeeping action."
        : "Housekeeping access is required.",
    );
    error.statusCode = 403;
    throw error;
  }
  return role;
}
