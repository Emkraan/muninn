import { eq } from "@homarr/db";
import type { Database } from "@homarr/db";
import { oidcProviders } from "@homarr/db/schema";
import type { AuthProviderKey, SupportedAuthProvider } from "@homarr/definitions";
import { supportedAuthProviders } from "@homarr/definitions";

import { env } from "../env";

export type GroupMemberManagementType = "local" | "mixed" | "external";

export const isProviderEnabled = (provider: SupportedAuthProvider) => {
  // The question mark is placed there because isProviderEnabled is called during static build of about page
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
  return env.AUTH_PROVIDERS?.includes(provider);
};

/**
 * Whether a single provider's group memberships are managed locally (manually via UI/API).
 * True for credentials users, and for oidc users when AUTH_OIDC_GROUPS_LOCAL_MANAGEMENT is enabled.
 *
 * NOTE: This is the coarse env-based check. DB OIDC providers namespace to
 * "oidc-<key>" and carry their own per-provider groupsLocalManagement flag; the
 * authoritative per-user check is isGroupMembershipManagedLocallyForUserAsync
 * below. This sync form is kept for the enabled-provider-class helpers and any
 * legacy env-provider account (id "oidc").
 */
export const isGroupMembershipManagedLocally = (provider: AuthProviderKey): boolean => {
  if (provider === "credentials") return true;
  // "oidc" (legacy env provider) or any namespaced DB provider "oidc-<key>".
  if (provider === "oidc" || provider.startsWith("oidc-")) return env.AUTH_OIDC_GROUPS_LOCAL_MANAGEMENT;
  // ldap + any provider added later: externally managed (synced, not editable
  // here) until explicitly handled. New providers safe-by-default.
  return false;
};

export const getEnabledProviders = (): SupportedAuthProvider[] => supportedAuthProviders.filter(isProviderEnabled);

/**
 * The enabled providers whose group memberships can be managed locally.
 */
export const getLocallyManageableProviders = (): SupportedAuthProvider[] =>
  getEnabledProviders().filter(isGroupMembershipManagedLocally);

/**
 * Classifies group-member management across all enabled providers:
 * - "local": every enabled provider is managed locally (no member is synced externally)
 * - "external": no enabled provider is managed locally (every member is synced externally)
 * - "mixed": some are managed locally, some externally (only a subset of members is editable here)
 */
export const getGroupMemberManagementType = (): GroupMemberManagementType => {
  const enabled = getEnabledProviders();
  const manageable = enabled.filter(isGroupMembershipManagedLocally);

  if (manageable.length === enabled.length) return "local";
  if (manageable.length === 0) return "external";
  return "mixed";
};

/**
 * Whether group memberships can be managed locally for at least one enabled provider.
 */
export const canManageGroupMembersLocally = (): boolean => getLocallyManageableProviders().length > 0;

// --- DB-aware, per-provider variants (P4 multi-OIDC) -------------------------
// The sync helpers above read the single global env.AUTH_OIDC_GROUPS_LOCAL_MANAGEMENT
// flag, which no longer matches reality once each DB OIDC provider carries its
// own groupsLocalManagement flag (and OIDC providers are DB-gated, not gated by
// AUTH_PROVIDERS). These async variants resolve the flag from the DB so the UI
// editability and the sign-in group sync (events.ts) can no longer disagree.

const oidcKeyFromProvider = (provider: AuthProviderKey): string | null =>
  provider.startsWith("oidc-") ? provider.slice("oidc-".length) : null;

/**
 * Authoritative per-user check. users.provider is namespaced "oidc-<key>", so
 * the specific provider's groupsLocalManagement flag is the source of truth
 * (matching the sign-in group sync). Falls back to the global env default for a
 * legacy env-provider account (provider "oidc", no DB row).
 */
export const isGroupMembershipManagedLocallyForUserAsync = async (
  database: Database,
  provider: AuthProviderKey,
): Promise<boolean> => {
  if (provider === "credentials") return true;
  if (provider === "oidc") return env.AUTH_OIDC_GROUPS_LOCAL_MANAGEMENT;
  const key = oidcKeyFromProvider(provider);
  if (key === null) return false;
  const row = await database.query.oidcProviders.findFirst({
    where: eq(oidcProviders.key, key),
    columns: { groupsLocalManagement: true },
  });
  return row?.groupsLocalManagement ?? env.AUTH_OIDC_GROUPS_LOCAL_MANAGEMENT;
};

/** Batched per-user resolution: one providers query -> userId -> managed-locally. */
export const getGroupMembershipManagedLocallyByUserAsync = async (
  database: Database,
  members: { id: string; provider: AuthProviderKey }[],
): Promise<Map<string, boolean>> => {
  const result = new Map<string, boolean>();
  const keyByUser = new Map<string, string>();
  for (const member of members) {
    if (member.provider === "credentials") {
      result.set(member.id, true);
    } else if (member.provider === "oidc") {
      result.set(member.id, env.AUTH_OIDC_GROUPS_LOCAL_MANAGEMENT);
    } else {
      const key = oidcKeyFromProvider(member.provider);
      if (key === null) result.set(member.id, false);
      else keyByUser.set(member.id, key);
    }
  }
  if (keyByUser.size > 0) {
    const rows = await database.query.oidcProviders.findMany({
      columns: { key: true, groupsLocalManagement: true },
    });
    const flagByKey = new Map(rows.map((row) => [row.key, row.groupsLocalManagement]));
    for (const [userId, key] of keyByUser) {
      result.set(userId, flagByKey.get(key) ?? env.AUTH_OIDC_GROUPS_LOCAL_MANAGEMENT);
    }
  }
  return result;
};

// "oidc" is available when AUTH_PROVIDERS lists it (legacy env provider) OR any
// enabled DB provider exists (the DB-driven model).
const isOidcEnabledAsync = async (database: Database): Promise<boolean> => {
  if (isProviderEnabled("oidc")) return true;
  const row = await database.query.oidcProviders.findFirst({
    where: eq(oidcProviders.enabled, true),
    columns: { id: true },
  });
  return row != null;
};

const anyEnabledOidcProviderManagedLocallyAsync = async (database: Database): Promise<boolean> => {
  const rows = await database.query.oidcProviders.findMany({
    columns: { enabled: true, groupsLocalManagement: true },
  });
  const enabled = rows.filter((row) => row.enabled);
  if (enabled.length === 0) return env.AUTH_OIDC_GROUPS_LOCAL_MANAGEMENT; // legacy env single-OIDC
  return enabled.some((row) => row.groupsLocalManagement);
};

export interface GroupMemberManagement {
  type: GroupMemberManagementType;
  manageableProviders: SupportedAuthProvider[];
}

/**
 * DB-aware group-member management summary for the members page: the overall
 * type (local/mixed/external) and which enabled provider classes can be managed
 * locally. Resolves OIDC enablement + local-management from the DB.
 */
export const resolveGroupMemberManagementAsync = async (database: Database): Promise<GroupMemberManagement> => {
  const nonOidcEnabled = supportedAuthProviders.filter((provider) => provider !== "oidc" && isProviderEnabled(provider));
  const enabled: SupportedAuthProvider[] = (await isOidcEnabledAsync(database))
    ? [...nonOidcEnabled, "oidc"]
    : nonOidcEnabled;

  const oidcLocal = enabled.includes("oidc") ? await anyEnabledOidcProviderManagedLocallyAsync(database) : false;
  const manageableProviders = enabled.filter((provider) =>
    provider === "oidc" ? oidcLocal : isGroupMembershipManagedLocally(provider),
  );

  const type: GroupMemberManagementType =
    manageableProviders.length === enabled.length
      ? "local"
      : manageableProviders.length === 0
        ? "external"
        : "mixed";
  return { type, manageableProviders };
};

export const canManageGroupMembersLocallyAsync = async (database: Database): Promise<boolean> =>
  (await resolveGroupMemberManagementAsync(database)).manageableProviders.length > 0;
