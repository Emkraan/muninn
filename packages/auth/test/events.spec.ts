import type { ResponseCookie } from "next/dist/compiled/@edge-runtime/cookies";
import type { ReadonlyRequestCookies } from "next/dist/server/web/spec-extension/adapters/request-cookies";
import { cookies } from "next/headers";
import { describe, expect, test, vi } from "vitest";

import { eq } from "@homarr/db";
import type { Database } from "@homarr/db";
import { groupMembers, groups, oidcProviders, users } from "@homarr/db/schema";
import { createDb } from "@homarr/db/test";
import { colorSchemeCookieKey, everyoneGroup } from "@homarr/definitions";

import { createSignInEventHandler } from "../events";

vi.mock("next-auth", () => ({}));
const mockEnv = vi.hoisted(() => ({
  AUTH_OIDC_GROUPS_ATTRIBUTE: "someRandomGroupsKey",
  AUTH_OIDC_GROUPS_LOCAL_MANAGEMENT: false,
}));
vi.mock("../env", () => {
  return {
    env: mockEnv,
  };
});
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
type HeadersExport = typeof import("next/headers");
vi.mock("next/headers", async (importOriginal) => {
  const mod = await importOriginal<HeadersExport>();

  const result = {
    set: (name: string, value: string, options: Partial<ResponseCookie>) => options as ResponseCookie,
  } as unknown as ReadonlyRequestCookies;

  vi.spyOn(result, "set");

  const cookies = () => Promise.resolve(result);

  return { ...mod, cookies } satisfies HeadersExport;
});

describe("createSignInEventHandler should create signInEventHandler", () => {
  describe("signInEventHandler should add users to everyone group", () => {
    test("should add user to everyone group if he isn't already", async () => {
      // Arrange
      const db = createDb();
      await createUserAsync(db);
      await createGroupAsync(db, everyoneGroup);
      const eventHandler = createSignInEventHandler(db);

      // Act
      await eventHandler?.({
        user: { id: "1", name: "test" },
        profile: undefined,
        account: null,
      });

      // Assert
      const dbGroupMembers = await db.query.groupMembers.findFirst({
        where: eq(groupMembers.userId, "1"),
      });
      expect(dbGroupMembers?.groupId).toBe("1");
    });
  });

  describe("signInEventHandler should synchronize ldap groups", () => {
    test("should add missing group membership", async () => {
      // Arrange
      const db = createDb();
      await createUserAsync(db);
      await createGroupAsync(db);
      const eventHandler = createSignInEventHandler(db);

      // Act
      await eventHandler?.({
        user: { id: "1", name: "test", groups: ["test"] } as never,
        profile: undefined,
        account: null,
      });

      // Assert
      const dbGroupMembers = await db.query.groupMembers.findFirst({
        where: eq(groupMembers.userId, "1"),
      });
      expect(dbGroupMembers?.groupId).toBe("1");
    });
    test("should remove group membership", async () => {
      // Arrange
      const db = createDb();
      await createUserAsync(db);
      await createGroupAsync(db);
      await db.insert(groupMembers).values({
        userId: "1",
        groupId: "1",
      });
      const eventHandler = createSignInEventHandler(db);

      // Act
      await eventHandler?.({
        user: { id: "1", name: "test", groups: [] } as never,
        profile: undefined,
        account: null,
      });

      // Assert
      const dbGroupMembers = await db.query.groupMembers.findFirst({
        where: eq(groupMembers.userId, "1"),
      });
      expect(dbGroupMembers).toBeUndefined();
    });
    test("should not remove group membership for everyone group", async () => {
      // Arrange
      const db = createDb();
      await createUserAsync(db);
      await createGroupAsync(db, everyoneGroup);
      await db.insert(groupMembers).values({
        userId: "1",
        groupId: "1",
      });
      const eventHandler = createSignInEventHandler(db);

      // Act
      await eventHandler?.({
        user: { id: "1", name: "test", groups: [] } as never,
        profile: undefined,
        account: null,
      });

      // Assert
      const dbGroupMembers = await db.query.groupMembers.findFirst({
        where: eq(groupMembers.userId, "1"),
      });
      expect(dbGroupMembers?.groupId).toBe("1");
    });
  });
  describe("signInEventHandler should synchronize Authentik group_ids (authentik-broker-standard Rule 9)", () => {
    // The groups claim key + local-management flag now come from the DB provider
    // row (keyed by the "oidc-<key>" NextAuth id on the account), not env.
    const oidcAccount = { provider: "oidc-test", providerAccountId: "sub", type: "oidc" } as never;

    test("should add missing group membership by external Authentik group id", async () => {
      // Arrange
      const db = createDb();
      await createUserAsync(db);
      await createGroupAsync(db, "test", "authentik-group-1");
      await createOidcProviderAsync(db);
      const eventHandler = createSignInEventHandler(db);

      // Act
      await eventHandler?.({
        user: { id: "1", name: "test" },
        profile: { preferred_username: "test", group_ids: ["authentik-group-1"] },
        account: oidcAccount,
      });

      // Assert
      const dbGroupMembers = await db.query.groupMembers.findFirst({
        where: eq(groupMembers.userId, "1"),
      });
      expect(dbGroupMembers?.groupId).toBe("1");
    });
    test("should remove group membership no longer present in group_ids", async () => {
      // Arrange
      const db = createDb();
      await createUserAsync(db);
      await createGroupAsync(db, "test", "authentik-group-1");
      await createOidcProviderAsync(db);
      await db.insert(groupMembers).values({
        userId: "1",
        groupId: "1",
      });
      const eventHandler = createSignInEventHandler(db);

      // Act
      await eventHandler?.({
        user: { id: "1", name: "test" },
        profile: { preferred_username: "test", group_ids: [] },
        account: oidcAccount,
      });

      // Assert
      const dbGroupMembers = await db.query.groupMembers.findFirst({
        where: eq(groupMembers.userId, "1"),
      });
      expect(dbGroupMembers).toBeUndefined();
    });
    test("should not remove group membership for everyone group", async () => {
      // Arrange
      const db = createDb();
      await createUserAsync(db);
      await createGroupAsync(db, everyoneGroup);
      await createOidcProviderAsync(db);
      await db.insert(groupMembers).values({
        userId: "1",
        groupId: "1",
      });
      const eventHandler = createSignInEventHandler(db);

      // Act
      await eventHandler?.({
        user: { id: "1", name: "test" },
        profile: { preferred_username: "test", group_ids: [] },
        account: oidcAccount,
      });

      // Assert
      const dbGroupMembers = await db.query.groupMembers.findFirst({
        where: eq(groupMembers.userId, "1"),
      });
      expect(dbGroupMembers?.groupId).toBe("1");
    });
    test("should not touch group membership of a local group with no stored external id", async () => {
      // Arrange: local group was never linked to Authentik (externalAuthentikGroupId
      // stays null) and is not in the token's group_ids either; it must be left alone.
      const db = createDb();
      await createUserAsync(db);
      await createGroupAsync(db);
      await createOidcProviderAsync(db);
      await db.insert(groupMembers).values({
        userId: "1",
        groupId: "1",
      });
      const eventHandler = createSignInEventHandler(db);

      // Act
      await eventHandler?.({
        user: { id: "1", name: "test" },
        profile: { preferred_username: "test", group_ids: [] },
        account: oidcAccount,
      });

      // Assert
      const dbGroupMembers = await db.query.groupMembers.findFirst({
        where: eq(groupMembers.userId, "1"),
      });
      expect(dbGroupMembers?.groupId).toBe("1");
    });
    test("should not synchronize groups when the provider manages groups locally", async () => {
      // Arrange
      const db = createDb();
      await createUserAsync(db);
      await createGroupAsync(db, "test", "authentik-group-1");
      await createOidcProviderAsync(db, { groupsLocalManagement: true });
      const eventHandler = createSignInEventHandler(db);

      // Act
      await eventHandler?.({
        user: { id: "1", name: "test" },
        profile: { preferred_username: "test", group_ids: ["authentik-group-1"] },
        account: oidcAccount,
      });

      // Assert
      const dbGroupMembers = await db.query.groupMembers.findFirst({
        where: eq(groupMembers.userId, "1"),
      });
      expect(dbGroupMembers).toBeUndefined();
    });
    test("should fail closed: leave group membership unchanged when the token carries no group_ids claim", async () => {
      // Arrange: a token from a provider that never emits group_ids (or an
      // error) must NOT clobber membership, and must NOT fall back to the
      // display-only groups names claim.
      const db = createDb();
      await createUserAsync(db);
      await createGroupAsync(db, "test", "authentik-group-1");
      await createOidcProviderAsync(db);
      await db.insert(groupMembers).values({
        userId: "1",
        groupId: "1",
      });
      const eventHandler = createSignInEventHandler(db);

      // Act: profile carries the display-only "groups" names claim but no group_ids.
      await eventHandler?.({
        user: { id: "1", name: "test" },
        profile: { preferred_username: "test", someRandomGroupsKey: [] },
        account: oidcAccount,
      });

      // Assert: membership from before sign-in is untouched.
      const dbGroupMembers = await db.query.groupMembers.findFirst({
        where: eq(groupMembers.userId, "1"),
      });
      expect(dbGroupMembers?.groupId).toBe("1");
    });
    test("should fail closed: leave group membership unchanged when group_ids is an empty array", async () => {
      // Arrange: authentik-broker-standard Rule 9 requires that the app "must
      // also not overwrite the app's cached group ids with an empty set" - an
      // empty group_ids array (e.g. from a transient IdP/mapping glitch) must
      // be treated the same as an absent claim, never as "user is in zero
      // groups now, strip everything" (which could strip an admin's own
      // admin-granting group).
      const db = createDb();
      await createUserAsync(db);
      await createGroupAsync(db, "test", "authentik-group-1");
      await createOidcProviderAsync(db);
      await db.insert(groupMembers).values({
        userId: "1",
        groupId: "1",
      });
      const eventHandler = createSignInEventHandler(db);

      // Act: profile carries an empty group_ids array.
      await eventHandler?.({
        user: { id: "1", name: "test" },
        profile: { preferred_username: "test", group_ids: [], someRandomGroupsKey: [] },
        account: oidcAccount,
      });

      // Assert: membership from before sign-in is untouched.
      const dbGroupMembers = await db.query.groupMembers.findFirst({
        where: eq(groupMembers.userId, "1"),
      });
      expect(dbGroupMembers?.groupId).toBe("1");
    });
    test("should backfill externalAuthentikGroupId by exact name match, once, then sync by id", async () => {
      // Arrange: a local group that predates the group_ids rollout (no stored
      // external id yet), whose name matches an entry in the token's
      // display-only groups names claim at the same index as its group_ids entry.
      const db = createDb();
      await createUserAsync(db);
      await createGroupAsync(db, "test");
      await createOidcProviderAsync(db);
      const eventHandler = createSignInEventHandler(db);

      // Act
      await eventHandler?.({
        user: { id: "1", name: "test" },
        profile: {
          preferred_username: "test",
          group_ids: ["authentik-group-1"],
          someRandomGroupsKey: ["test"],
        },
        account: oidcAccount,
      });

      // Assert: the local group was backfilled and the user was added by id.
      const dbGroup = await db.query.groups.findFirst({ where: eq(groups.id, "1") });
      expect(dbGroup?.externalAuthentikGroupId).toBe("authentik-group-1");
      const dbGroupMembers = await db.query.groupMembers.findFirst({
        where: eq(groupMembers.userId, "1"),
      });
      expect(dbGroupMembers?.groupId).toBe("1");
    });
    test("should NOT backfill by name when two distinct Authentik groups share that name (ambiguous match)", async () => {
      // Arrange: the token's group_ids/groups claims contain two DIFFERENT
      // Authentik group ids that both display as "test" (e.g. one renamed
      // into a collision, or two separately created groups with the same
      // name). An exact name match here cannot tell which one is the local
      // group's real counterpart, so the local group must be left unlinked
      // rather than silently paired with whichever id happened to be last.
      const db = createDb();
      await createUserAsync(db);
      await createGroupAsync(db, "test");
      await createOidcProviderAsync(db);
      const eventHandler = createSignInEventHandler(db);

      // Act
      await eventHandler?.({
        user: { id: "1", name: "test" },
        profile: {
          preferred_username: "test",
          group_ids: ["authentik-group-1", "authentik-group-2"],
          someRandomGroupsKey: ["test", "test"],
        },
        account: oidcAccount,
      });

      // Assert: the local group was NOT backfilled, and membership by id was
      // not established for either candidate (fail closed on ambiguity).
      const dbGroup = await db.query.groups.findFirst({ where: eq(groups.id, "1") });
      expect(dbGroup?.externalAuthentikGroupId).toBeNull();
      const dbGroupMembers = await db.query.groupMembers.findFirst({
        where: eq(groupMembers.userId, "1"),
      });
      expect(dbGroupMembers).toBeUndefined();
    });
  });
  test.each([
    ["ldap" as const, { name: "test-new" }, undefined],
    ["oidc" as const, { name: "test" }, { preferred_username: "test-new" }],
    ["oidc" as const, { name: "test" }, { preferred_username: "test@example.com", name: "test-new" }],
  ])("signInEventHandler should update username for %s provider", async (_provider, user, profile) => {
    // Arrange
    const db = createDb();
    await createUserAsync(db);
    const eventHandler = createSignInEventHandler(db);

    // Act
    await eventHandler?.({
      user: { id: "1", ...user },
      profile,
      account: null,
    });

    // Assert
    const dbUser = await db.query.users.findFirst({
      where: eq(users.id, "1"),
      columns: {
        name: true,
      },
    });
    expect(dbUser?.name).toBe("test-new");
  });
  test("signInEventHandler should resolve the username from the provider's nameClaim (per-provider)", async () => {
    // Arrange: provider configured with a custom nameClaim, and a profile that
    // has NO preferred_username/name (only the custom claim). The old global
    // extractProfileName would have thrown; the per-provider path must use the
    // claim value and not overwrite it.
    const db = createDb();
    await createUserAsync(db);
    await createOidcProviderAsync(db, { nameClaim: "display_name" });
    const eventHandler = createSignInEventHandler(db);

    // Act
    await eventHandler?.({
      user: { id: "1", name: "test" },
      profile: { sub: "abc", display_name: "Alice Corp", email: "alice@corp.com" },
      account: { provider: "oidc-test", providerAccountId: "abc", type: "oidc" } as never,
    });

    // Assert
    const dbUser = await db.query.users.findFirst({
      where: eq(users.id, "1"),
      columns: { name: true },
    });
    expect(dbUser?.name).toBe("Alice Corp");
  });
  test("signInEventHandler should set color-scheme cookie", async () => {
    // Arrange
    const db = createDb();
    await createUserAsync(db);
    const eventHandler = createSignInEventHandler(db);

    // Act
    await eventHandler?.({
      user: { id: "1", name: "test" },
      profile: undefined,
      account: null,
    });

    // Assert
    expect((await cookies()).set).toHaveBeenCalledWith(
      colorSchemeCookieKey,
      "dark",
      expect.objectContaining({
        path: "/",
      }),
    );
  });
});

const createUserAsync = async (db: Database) =>
  await db.insert(users).values({
    id: "1",
    name: "test",
    colorScheme: "dark",
  });

const createGroupAsync = async (db: Database, name = "test", externalAuthentikGroupId: string | null = null) =>
  await db.insert(groups).values({
    id: "1",
    name,
    position: 1,
    externalAuthentikGroupId,
  });

const createOidcProviderAsync = async (
  db: Database,
  options?: { groupsLocalManagement?: boolean; nameClaim?: string },
) =>
  await db.insert(oidcProviders).values({
    id: "1",
    key: "test",
    displayName: "Test",
    providerType: "oidc",
    clientId: "client-id",
    clientSecret: "aa.bb",
    groupsClaim: "someRandomGroupsKey",
    nameClaim: options?.nameClaim ?? null,
    groupsLocalManagement: options?.groupsLocalManagement ?? false,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
