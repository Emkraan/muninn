/* eslint-disable @typescript-eslint/no-non-null-assertion */
import { describe, expect, test, vi } from "vitest";

import { eq } from "@homarr/db";
import { createId } from "@homarr/common";
import { apiKeys, groupMembers, groupPermissions, groups, users } from "@homarr/db/schema";
import { createDb } from "@homarr/db/test";
import type { GroupPermissionKey } from "@homarr/definitions";

import { hashPasswordAsync } from "../../security";
import { getSessionFromApiKeyAsync } from "../get-api-key-session";

// Mock the logger to avoid console output during tests
vi.mock("@homarr/core/infrastructure/logs", () => ({
  createLogger: () => ({
    warn: vi.fn(),
    info: vi.fn(),
  }),
}));

const defaultUserId = createId();
const defaultUsername = "testuser";
const defaultApiKeyId = createId();
const defaultIpAddress = "127.0.0.1";
const defaultUserAgent = "test-agent";
const defaultLogParams = [defaultIpAddress, defaultUserAgent] as const;

describe("getSessionFromApiKeyAsync", () => {
  test("should return null when api key header is null", async () => {
    // Arrange
    const { db } = await setupAsync();
    const apiKey = null;

    // Act
    const result = await getSessionFromApiKeyAsync(db, apiKey, ...defaultLogParams);

    // Assert
    expect(result).toBeNull();
  });

  test.each([
    ["invalidformat", "no dot"],
    ["keyid.", "missing token"],
    [".token", "missing id"],
  ])("should return null when api key format is invalid key=%s reason=%s", async (apiKey) => {
    // Arrange
    const { db } = await setupAsync();

    // Act
    const result = await getSessionFromApiKeyAsync(db, apiKey, ...defaultLogParams);

    // Assert
    expect(result).toBeNull();
  });

  test("should return null when api key is not found in database", async () => {
    // Arrange
    const { db } = await setupAsync();

    // Act
    const result = await getSessionFromApiKeyAsync(db, "nonexistent.token", ...defaultLogParams);

    // Assert
    expect(result).toBeNull();
  });

  test("should return null when api key token does not match", async () => {
    // Arrange
    const { db } = await setupAsync({ token: "correcttoken" });

    // Act
    const result = await getSessionFromApiKeyAsync(db, `${defaultApiKeyId}.wrongtoken`, ...defaultLogParams);

    // Assert
    expect(result).toBeNull();
  });

  test("should return session when api key is valid", async () => {
    // Arrange
    const token = "validtesttoken123";
    const { db } = await setupAsync({ token });

    // Act
    const result = await getSessionFromApiKeyAsync(db, `${defaultApiKeyId}.${token}`, ...defaultLogParams);

    // Assert
    expect(result).not.toBeNull();
    expect(result!.user.id).toEqual(defaultUserId);
    expect(result!.user.name).toEqual(defaultUsername);
  });

  test("should work with null ip address", async () => {
    // Arrange
    const token = "validtesttoken456";
    const { db } = await setupAsync({ token });

    // Act
    const result = await getSessionFromApiKeyAsync(db, `${defaultApiKeyId}.${token}`, null, defaultUserAgent);

    // Assert
    expect(result).not.toBeNull();
    expect(result!.user.id).toEqual(defaultUserId);
  });

  test("should return null when the api key is expired", async () => {
    // Arrange
    const token = "expiredtoken123";
    const { db } = await setupAsync({ token, expiresAt: new Date(Date.now() - 60_000) });

    // Act
    const result = await getSessionFromApiKeyAsync(db, `${defaultApiKeyId}.${token}`, ...defaultLogParams);

    // Assert
    expect(result).toBeNull();
  });

  test("should return a session when the api key expiry is in the future", async () => {
    // Arrange
    const token = "futuretoken123";
    const { db } = await setupAsync({ token, expiresAt: new Date(Date.now() + 60_000) });

    // Act
    const result = await getSessionFromApiKeyAsync(db, `${defaultApiKeyId}.${token}`, ...defaultLogParams);

    // Assert
    expect(result).not.toBeNull();
    expect(result!.user.id).toEqual(defaultUserId);
  });

  test("should intersect the session permissions with the key scopes (least privilege)", async () => {
    // Arrange: owner is a full admin but the key is scoped to a single read permission.
    const token = "scopedtoken123";
    const { db } = await setupAsync({
      token,
      grantPermissions: ["admin"],
      scopes: ["board-view-all"],
    });

    // Act
    const result = await getSessionFromApiKeyAsync(db, `${defaultApiKeyId}.${token}`, ...defaultLogParams);

    // Assert: the minted session is narrowed to exactly the granted scope.
    expect(result).not.toBeNull();
    expect(result!.user.permissions).toEqual(["board-view-all"]);
    expect(result!.user.permissions).not.toContain("admin");
    expect(result!.user.permissions).not.toContain("integration-full-all");
  });

  test("should expand key scopes with their implied children before intersecting", async () => {
    // Arrange: board-modify-all implies board-view-all.
    const token = "scopedtoken456";
    const { db } = await setupAsync({
      token,
      grantPermissions: ["admin"],
      scopes: ["board-modify-all"],
    });

    // Act
    const result = await getSessionFromApiKeyAsync(db, `${defaultApiKeyId}.${token}`, ...defaultLogParams);

    // Assert
    expect(result).not.toBeNull();
    expect(result!.user.permissions).toContain("board-modify-all");
    expect(result!.user.permissions).toContain("board-view-all");
    expect(result!.user.permissions).not.toContain("admin");
  });

  test("should treat a legacy null-scope key as a full-permission key", async () => {
    // Arrange: legacy key (scopes column is null) owned by a full admin.
    const token = "legacytoken123";
    const { db } = await setupAsync({
      token,
      grantPermissions: ["admin"],
      scopes: null,
    });

    // Act
    const result = await getSessionFromApiKeyAsync(db, `${defaultApiKeyId}.${token}`, ...defaultLogParams);

    // Assert: the owner's full permission set is preserved for backwards compatibility.
    expect(result).not.toBeNull();
    expect(result!.user.permissions).toContain("admin");
    expect(result!.user.permissions).toContain("integration-full-all");
  });

  test("should stamp lastUsedAt on successful authentication", async () => {
    // Arrange
    const token = "stamptoken123";
    const { db } = await setupAsync({ token });

    // Act
    const result = await getSessionFromApiKeyAsync(db, `${defaultApiKeyId}.${token}`, ...defaultLogParams);

    // Assert
    expect(result).not.toBeNull();
    const stored = await db.query.apiKeys.findFirst({ where: eq(apiKeys.id, defaultApiKeyId) });
    expect(stored?.lastUsedAt).not.toBeNull();
  });
});

interface SetupOptions {
  /**
   * If provided, inserts an API key into the database for testing.
   */
  token?: string;
  /**
   * Scopes to persist on the key. `undefined` leaves the column unset (defaults
   * to null, i.e. a legacy full-permission key); `null` is stored explicitly.
   */
  scopes?: GroupPermissionKey[] | null;
  /**
   * Absolute expiry to persist on the key. `null`/omitted means never expires.
   */
  expiresAt?: Date | null;
  /**
   * Group permissions to grant the owning user (so the minted session carries
   * real permissions to intersect against).
   */
  grantPermissions?: GroupPermissionKey[];
}

const setupAsync = async (options?: SetupOptions) => {
  const db = createDb();

  await db.insert(users).values({
    id: defaultUserId,
    name: defaultUsername,
    email: "test@example.com",
  });

  if (options?.grantPermissions && options.grantPermissions.length > 0) {
    const groupId = createId();
    await db.insert(groups).values({ id: groupId, name: `group-${groupId}`, position: 1 });
    await db.insert(groupMembers).values({ groupId, userId: defaultUserId });
    await db
      .insert(groupPermissions)
      .values(options.grantPermissions.map((permission) => ({ groupId, permission })));
  }

  if (options?.token) {
    await db.insert(apiKeys).values({
      id: defaultApiKeyId,
      apiKey: await hashPasswordAsync(options.token),
      userId: defaultUserId,
      name: "test key",
      scopes: options.scopes ? JSON.stringify(options.scopes) : null,
      expiresAt: options.expiresAt ?? null,
    });
  }

  return {
    db,
  };
};
