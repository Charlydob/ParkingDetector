const USERNAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{1,31}$/;

export function cleanString(value) {
  return typeof value === "string" ? value.trim() : "";
}

export function normalizeUsername(value) {
  const username = cleanString(value);
  return username ? username.toLowerCase() : null;
}

export function assertValidUsername(value) {
  const username = cleanString(value);

  if (!username) {
    return "";
  }

  if (!USERNAME_PATTERN.test(username)) {
    const error = new Error("Username must be 2-32 letters, numbers, dots, dashes or underscores.");
    error.statusCode = 400;
    throw error;
  }

  return username;
}

function usefulDisplayName(user = {}) {
  const displayName = cleanString(user.displayName);
  const email = cleanString(user.email);

  if (!displayName || displayName.toLowerCase() === email.toLowerCase()) {
    return "";
  }

  return displayName;
}

export function displayNameForMembership(user = {}, membership = {}) {
  return (
    cleanString(membership?.alias) ||
    cleanString(user?.username) ||
    usefulDisplayName(user) ||
    cleanString(user?.email) ||
    cleanString(user?.id)
  );
}

export async function updateOwnUserProfile(database, session, input = {}) {
  const user = await database.getRecord("users", session.user.id);

  if (!user || user.active === false) {
    const error = new Error("User not found.");
    error.statusCode = 404;
    throw error;
  }

  const username =
    input.username === null || input.username === undefined
      ? user.username || ""
      : assertValidUsername(input.username);
  const usernameNormalized = normalizeUsername(username);

  if (usernameNormalized) {
    const owner = (await database.listRecords("users")).find(
      (candidate) =>
        candidate.id !== user.id &&
        normalizeUsername(candidate.username || candidate.usernameNormalized) === usernameNormalized,
    );

    if (owner) {
      const error = new Error("Username is already taken.");
      error.statusCode = 409;
      throw error;
    }
  }

  const next = {
    ...user,
    username: username || null,
    usernameNormalized,
    updatedAt: new Date().toISOString(),
  };

  await database.setRecord("users", user.id, next);
  const { passwordHash, ...safeUser } = next;
  return safeUser;
}

export async function updateTenantMembershipAlias(
  database,
  session,
  tenantId,
  membershipId,
  input = {},
  assertCanManage,
) {
  assertCanManage(session, tenantId);

  const membership = await database.getRecord("memberships", membershipId);
  if (!membership || membership.tenantId !== tenantId) {
    const error = new Error("Membership not found.");
    error.statusCode = 404;
    throw error;
  }

  const alias = cleanString(input.alias).slice(0, 64);
  const next = {
    ...membership,
    alias: alias || null,
    updatedAt: new Date().toISOString(),
  };

  await database.setRecord("memberships", membership.id, next);
  return next;
}
