import { describe, expect, test } from "vitest";

import { users } from "@homarr/db/schema";
import { createDb } from "@homarr/db/test";

import { createAdapter } from "../adapter";

describe("createAdapter should create drizzle adapter", () => {
  test.each([["credentials" as const], ["ldap" as const], ["oidc" as const]])(
    "createAdapter getUserByEmail should return user for provider %s when this provider provided",
    async (provider) => {
      // Arrange
      const db = createDb();
      const adapter = createAdapter(db, provider);
      const email = "test@example.com";
      await db.insert(users).values({ id: "1", name: "test", email, provider });

      // Act
      const user = await adapter.getUserByEmail?.(email);

      // Assert
      expect(user).toEqual({
        id: "1",
        name: "test",
        email,
        emailVerified: null,
        image: null,
      });
    },
  );

  test.each([
    ["credentials", ["ldap", "oidc"]],
    ["ldap", ["credentials", "oidc"]],
    ["oidc", ["credentials", "ldap"]],
  ] as const)(
    "createAdapter getUserByEmail should return null if only for other providers than %s exist",
    async (requestedProvider, existingProviders) => {
      // Arrange
      const db = createDb();
      const adapter = createAdapter(db, requestedProvider);
      const email = "test@example.com";
      for (const provider of existingProviders) {
        await db.insert(users).values({ id: provider, name: `test-${provider}`, email, provider });
      }

      // Act
      const user = await adapter.getUserByEmail?.(email);

      // Assert
      expect(user).toBeNull();
    },
  );

  test("createAdapter getUserByEmail should scope to one namespaced OIDC provider (cross-IdP isolation)", async () => {
    // Arrange: two DB OIDC IdPs share an email; users.provider is namespaced
    // "oidc-<key>". A sign-in via oidc-a must not resolve the oidc-b user (the
    // H1 cross-IdP collision the collapsed "oidc" value used to allow).
    const db = createDb();
    const email = "shared@example.com";
    await db.insert(users).values({ id: "a", name: "user-a", email, provider: "oidc-a" });
    await db.insert(users).values({ id: "b", name: "user-b", email, provider: "oidc-b" });

    // Act
    const viaA = await createAdapter(db, "oidc-a").getUserByEmail?.(email);
    const viaB = await createAdapter(db, "oidc-b").getUserByEmail?.(email);

    // Assert: each IdP resolves only its own user, never the other's.
    expect(viaA?.id).toBe("a");
    expect(viaB?.id).toBe("b");
  });

  test("createAdapter getUserByEmail should throw error if provider is unknown", async () => {
    // Arrange
    const db = createDb();
    const adapter = createAdapter(db, "unknown");
    const email = "test@example.com";

    // Act
    const actAsync = async () => await adapter.getUserByEmail?.(email);

    // Assert
    await expect(actAsync()).rejects.toThrow("Unable to get user by email for unknown provider");
  });
});
