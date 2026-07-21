import type { ReadonlyHeaders } from "next/dist/server/web/spec-extension/adapters/headers";

import { db, eq } from "@homarr/db";
import type { Database } from "@homarr/db";
import type { OidcProvider as OidcProviderRow } from "@homarr/db/schema";
import { oidcProviders } from "@homarr/db/schema";

import { buildOidcProviderFromDb } from "./oidc-provider";

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
  return rows.map((row) => buildOidcProviderFromDb(row, headers));
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
