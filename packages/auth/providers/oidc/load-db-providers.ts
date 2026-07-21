import type { ReadonlyHeaders } from "next/dist/server/web/spec-extension/adapters/headers";

import { createLogger } from "@homarr/core/infrastructure/logs";
import { db, eq } from "@homarr/db";
import type { Database } from "@homarr/db";
import type { OidcProvider as OidcProviderRow } from "@homarr/db/schema";
import { oidcProviders } from "@homarr/db/schema";

import { buildOidcProviderFromDb } from "./oidc-provider";

const logger = createLogger({ module: "oidcProviderStore" });

// Short-TTL module cache so we don't hit the DB on every auth request. The
// per-request NextAuth handler rebuild (createHandlersAsync) still picks up
// changes within the TTL; invalidateOidcProvidersCache() is called after every
// admin CRUD mutation so new/edited providers appear immediately.
const TTL_MS = 30_000;
let cache: { rows: OidcProviderRow[]; at: number } | null = null;

export const invalidateOidcProvidersCache = () => {
  cache = null;
};

const loadEnabledRowsAsync = async (): Promise<OidcProviderRow[]> => {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.rows;
  const rows = await db.query.oidcProviders.findMany({
    where: eq(oidcProviders.enabled, true),
  });
  cache = { rows, at: Date.now() };
  return rows;
};

/** Built NextAuth OIDC/OAuth2 providers for every enabled DB row. */
export const loadOidcProvidersAsync = async (headers: ReadonlyHeaders | null) => {
  const rows = await loadEnabledRowsAsync();
  // Build each provider defensively: a single unbuildable row (e.g. a client
  // secret that no longer decrypts after a SECRET_ENCRYPTION_KEY rotation or a
  // corrupt ciphertext) must NOT reject the whole handler build and take down
  // every auth method (credentials/ldap included). Skip the bad row, log it,
  // and keep the rest working.
  return rows.flatMap((row) => {
    try {
      return [buildOidcProviderFromDb(row, headers)];
    } catch (error) {
      logger.error(`Failed to build OIDC provider 'oidc-${row.key}' from DB; skipping it`, {
        key: row.key,
        error,
      });
      return [];
    }
  });
};

const splitList = (value: string | null | undefined) =>
  (value ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);

export interface OidcGroupConfig {
  groupsClaim: string;
  groupsLocalManagement: boolean;
  allowedGroups: string[];
  adminGroups: string[];
}

/**
 * Per-provider group-sync config, resolved by provider key (the part after the
 * "oidc-" NextAuth id prefix). Drives the sign-in event so group mapping works
 * from the DB provider store instead of the retired AUTH_OIDC_* env vars. Uses
 * the request's db handle (the sign-in path already has one) rather than the
 * module cache, so it stays correct under the test in-memory db.
 */
export const getOidcGroupConfigAsync = async (
  database: Database,
  key: string,
): Promise<OidcGroupConfig | null> => {
  const row = await database.query.oidcProviders.findFirst({
    where: eq(oidcProviders.key, key),
  });
  if (!row) return null;
  const claim = row.groupsClaim?.trim();
  return {
    groupsClaim: claim && claim.length > 0 ? claim : "groups",
    groupsLocalManagement: row.groupsLocalManagement,
    allowedGroups: splitList(row.allowedGroups),
    adminGroups: splitList(row.adminGroups),
  };
};

/**
 * Load the raw provider row by key (the part after the "oidc-" NextAuth id
 * prefix), regardless of enabled state, using the request's db handle. Lets the
 * sign-in event resolve the display name (and picture) through the SAME
 * per-provider path as account creation (buildProfileName / pictureClaim)
 * instead of the global env rule.
 */
export const getOidcProviderRowByKeyAsync = async (
  database: Database,
  key: string,
): Promise<OidcProviderRow | null> => {
  const row = await database.query.oidcProviders.findFirst({
    where: eq(oidcProviders.key, key),
  });
  return row ?? null;
};

export interface LoginProviderButton {
  id: string;
  key: string;
  displayName: string;
  providerType: OidcProviderRow["providerType"];
  isDefault: boolean;
}

/** Provider buttons for the login page (enabled AND show-on-login). */
export const loadLoginProvidersAsync = async (): Promise<LoginProviderButton[]> => {
  const rows = await loadEnabledRowsAsync();
  return rows
    .filter((row) => row.showOnLogin)
    .map((row) => ({
      id: `oidc-${row.key}`,
      key: row.key,
      displayName: row.displayName,
      providerType: row.providerType,
      isDefault: row.isDefault,
    }));
};
