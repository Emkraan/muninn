import { describe, expect, test, vi } from "vitest";

import type { Database } from "@homarr/db";
import { oidcProviders } from "@homarr/db/schema";
import { createDb } from "@homarr/db/test";

import { isOidcSignInAllowedAsync } from "../group-gate";

vi.mock("next-auth", () => ({}));

const insertOidcProviderAsync = async (
  db: Database,
  overrides: Partial<typeof oidcProviders.$inferInsert> = {},
) => {
  await db.insert(oidcProviders).values({
    id: overrides.id ?? "provider-1",
    key: overrides.key ?? "authentik",
    displayName: "Test provider",
    providerType: overrides.providerType ?? "authentik",
    clientId: "client-id",
    clientSecret: "iv.secret" as `${string}.${string}`,
    groupsClaim: overrides.groupsClaim ?? "groups",
    allowedGroups: overrides.allowedGroups ?? null,
    groupsLocalManagement: false,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  });
};

describe("isOidcSignInAllowedAsync", () => {
  test("allows sign-in when the provider is not an oidc DB provider (credentials/ldap unaffected)", async () => {
    const db = createDb();

    const result = await isOidcSignInAllowedAsync(db, "credentials", { group_ids: [] }, "user-1");

    expect(result).toBe(true);
  });

  test("allows sign-in when the gate is not configured at all (CRITICAL no-lockout: allowedGroups unset)", async () => {
    const db = createDb();
    await insertOidcProviderAsync(db, { key: "authentik", allowedGroups: null });

    const result = await isOidcSignInAllowedAsync(db, "oidc-authentik", { group_ids: [] }, "user-1");

    expect(result).toBe(true);
  });

  test("allows sign-in for an Authentik provider when the token carries an allowed group id", async () => {
    const db = createDb();
    await insertOidcProviderAsync(db, {
      key: "authentik",
      providerType: "authentik",
      allowedGroups: "11111111-1111-1111-1111-111111111111",
    });

    const result = await isOidcSignInAllowedAsync(
      db,
      "oidc-authentik",
      { group_ids: ["11111111-1111-1111-1111-111111111111"] },
      "user-1",
    );

    expect(result).toBe(true);
  });

  test("denies sign-in for an Authentik provider when group_ids is missing (fail closed, Rule 9)", async () => {
    const db = createDb();
    await insertOidcProviderAsync(db, {
      key: "authentik",
      providerType: "authentik",
      allowedGroups: "11111111-1111-1111-1111-111111111111",
    });

    const result = await isOidcSignInAllowedAsync(db, "oidc-authentik", { groups: ["some-name"] }, "user-1");

    expect(result).toBe(false);
  });

  test("denies sign-in for an Authentik provider when group_ids is an empty array (fail closed, Rule 9)", async () => {
    const db = createDb();
    await insertOidcProviderAsync(db, {
      key: "authentik",
      providerType: "authentik",
      allowedGroups: "11111111-1111-1111-1111-111111111111",
    });

    const result = await isOidcSignInAllowedAsync(db, "oidc-authentik", { group_ids: [] }, "user-1");

    expect(result).toBe(false);
  });

  test("denies sign-in for an Authentik provider when group_ids is present but does not intersect allowedGroups", async () => {
    const db = createDb();
    await insertOidcProviderAsync(db, {
      key: "authentik",
      providerType: "authentik",
      allowedGroups: "11111111-1111-1111-1111-111111111111",
    });

    const result = await isOidcSignInAllowedAsync(
      db,
      "oidc-authentik",
      { group_ids: ["22222222-2222-2222-2222-222222222222"], groups: ["some-other-name"] },
      "user-1",
    );

    expect(result).toBe(false);
  });

  test("migration compat: allows sign-in for an Authentik provider via a legacy group NAME in allowedGroups", async () => {
    const db = createDb();
    await insertOidcProviderAsync(db, {
      key: "authentik",
      providerType: "authentik",
      groupsClaim: "groups",
      // Legacy config: an operator who has not yet migrated to ids.
      allowedGroups: "sec-homelab-admin",
    });

    const result = await isOidcSignInAllowedAsync(
      db,
      "oidc-authentik",
      { group_ids: ["22222222-2222-2222-2222-222222222222"], groups: ["sec-homelab-admin"] },
      "user-1",
    );

    expect(result).toBe(true);
  });

  test("non-Authentik provider behaviour is unchanged: matches allowedGroups against the groups claim by name", async () => {
    const db = createDb();
    await insertOidcProviderAsync(db, {
      key: "entra",
      providerType: "microsoft",
      groupsClaim: "groups",
      allowedGroups: "sec-homelab-admin",
    });

    const allowed = await isOidcSignInAllowedAsync(db, "oidc-entra", { groups: ["sec-homelab-admin"] }, "user-1");
    const denied = await isOidcSignInAllowedAsync(db, "oidc-entra", { groups: ["some-other-group"] }, "user-1");

    expect(allowed).toBe(true);
    expect(denied).toBe(false);
  });

  test("non-Authentik provider is not fail-closed by a missing group_ids claim (it never looks at group_ids)", async () => {
    const db = createDb();
    await insertOidcProviderAsync(db, {
      key: "entra",
      providerType: "microsoft",
      groupsClaim: "groups",
      allowedGroups: "sec-homelab-admin",
    });

    const result = await isOidcSignInAllowedAsync(
      db,
      "oidc-entra",
      { groups: ["sec-homelab-admin"] /* no group_ids at all */ },
      "user-1",
    );

    expect(result).toBe(true);
  });
});
