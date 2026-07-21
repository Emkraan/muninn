import type { AuthProviderKey } from "@homarr/definitions";

import { and, eq, like } from "../..";
import type { Database } from "../..";
import { accounts, users } from "../../schema";

// Multi-provider OIDC. users.provider previously collapsed every DB OIDC
// provider to the literal "oidc", which let the adapter's getUserByEmail match
// users across different IdPs (cross-IdP lockout, or takeover with dangerous
// email linking). Providers now namespace to "oidc-<key>". Re-key each legacy
// "oidc" user to the "oidc-<key>" of its linked OIDC account (accounts.provider
// already stores the namespaced value). Idempotent: only touches provider ===
// "oidc"; a no-op on installs that never had an OIDC user (e.g. credentials-only).
export async function migrateOidcUserProviderNamespaceAsync(db: Database) {
  const legacyOidcUsers = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.provider, "oidc"));
  if (legacyOidcUsers.length === 0) return;

  let migrated = 0;
  for (const user of legacyOidcUsers) {
    const [account] = await db
      .select({ provider: accounts.provider })
      .from(accounts)
      .where(and(eq(accounts.userId, user.id), like(accounts.provider, "oidc-%")))
      .limit(1);
    // Orphan legacy "oidc" user with no namespaced account: leave as-is.
    if (!account) continue;
    await db
      .update(users)
      .set({ provider: account.provider as AuthProviderKey })
      .where(eq(users.id, user.id));
    migrated += 1;
  }

  if (migrated > 0) {
    console.log(`Namespaced OIDC user providers count="${migrated}"`);
  }
}
