import type { ReadonlyHeaders } from "next/dist/server/web/spec-extension/adapters/headers";

import { db, eq } from "@homarr/db";
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
