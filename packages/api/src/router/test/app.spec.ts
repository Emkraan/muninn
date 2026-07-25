/* eslint-disable @typescript-eslint/no-non-null-assertion */
import { describe, expect, test, vi } from "vitest";

import type { Session } from "@homarr/auth";
import { createId } from "@homarr/common";
import { eq } from "@homarr/db";
import { apps, appUserPermissions, users } from "@homarr/db/schema";
import { createDb } from "@homarr/db/test";
import type { GroupPermissionKey } from "@homarr/definitions";

import { appRouter } from "../app";
import * as appAccessControl from "../app/app-access-control";

// Mock the auth module to return an empty session
vi.mock("@homarr/auth", () => ({ auth: () => ({}) as Session }));

const createFakeAccessControl = (canAccess: boolean) =>
  vi.fn(
    class {
      canUserSeeAppAsync = async (_: string) => await Promise.resolve(canAccess);
      canUserSeeAppsAsync = async (_: string[]) => await Promise.resolve(canAccess);
    } as unknown as typeof appAccessControl.AppAccessControl,
  );

const createDefaultSession = (permissions: GroupPermissionKey[] = []): Session => ({
  user: { id: createId(), permissions, colorScheme: "light" },
  expires: new Date().toISOString(),
});

const sessionForUser = (userId: string, permissions: GroupPermissionKey[]): Session => ({
  user: { id: userId, permissions, colorScheme: "light" },
  expires: new Date().toISOString(),
});

describe("all should return all apps", () => {
  test("should return all apps with session", async () => {
    // Arrange
    const db = createDb();
    const caller = appRouter.createCaller({
      db,
      deviceType: undefined,
      // Strict per-user RBAC (P3): app.all is visibility-scoped. A user with a
      // broad app-visibility permission sees every app; a permission-less user
      // sees none (nothing is shared by default).
      session: createDefaultSession(["app-use-all"]),
    });

    await db.insert(apps).values([
      {
        id: "2",
        name: "Mantine",
        description: "React components and hooks library",
        iconUrl: "https://mantine.dev/favicon.svg",
        href: "https://mantine.dev",
      },
      {
        id: "1",
        name: "Tabler Icons",
        iconUrl: "https://tabler.io/favicon.ico",
      },
    ]);

    const result = await caller.all();
    expect(result.length).toBe(2);
    expect(result[0]!.id).toBe("2");
    expect(result[1]!.id).toBe("1");
    expect(result[0]!.href).toBeDefined();
    expect(result[0]!.description).toBeDefined();
    expect(result[1]!.href).toBeNull();
    expect(result[1]!.description).toBeNull();
  });
  test("should throw UNAUTHORIZED if the user is not authenticated", async () => {
    // Arrange
    const caller = appRouter.createCaller({
      db: createDb(),
      deviceType: undefined,
      session: null,
    });

    // Act
    const actAsync = async () => await caller.all();

    // Assert
    await expect(actAsync()).rejects.toThrow("UNAUTHORIZED");
  });
});

describe("byId should return an app by id", () => {
  test("should return an app by id when canUserSeeAppAsync returns true", async () => {
    // Arrange
    const db = createDb();
    const caller = appRouter.createCaller({
      db,
      deviceType: undefined,
      session: null,
    });
    vi.spyOn(appAccessControl, "AppAccessControl").mockImplementation(createFakeAccessControl(true));

    await db.insert(apps).values([
      {
        id: "2",
        name: "Mantine",
        description: "React components and hooks library",
        iconUrl: "https://mantine.dev/favicon.svg",
        href: "https://mantine.dev",
      },
      {
        id: "1",
        name: "Tabler Icons",
        iconUrl: "https://tabler.io/favicon.ico",
      },
    ]);

    // Act
    const result = await caller.byId({ id: "2" });

    // Assert
    expect(result.name).toBe("Mantine");
  });

  test("should throw NOT_FOUND error when canUserSeeAppAsync returns false", async () => {
    // Arrange
    const db = createDb();
    const caller = appRouter.createCaller({
      db,
      deviceType: undefined,
      session: null,
    });
    await db.insert(apps).values([
      {
        id: "2",
        name: "Mantine",
        description: "React components and hooks library",
        iconUrl: "https://mantine.dev/favicon.svg",
        href: "https://mantine.dev",
      },
    ]);
    vi.spyOn(appAccessControl, "AppAccessControl").mockImplementation(createFakeAccessControl(false));

    // Act
    const actAsync = async () => await caller.byId({ id: "2" });

    // Assert
    await expect(actAsync()).rejects.toThrow("App not found");
  });

  test("should throw an error if the app does not exist", async () => {
    // Arrange
    const db = createDb();
    const caller = appRouter.createCaller({
      db,
      deviceType: undefined,
      session: null,
    });

    // Act
    const actAsync = async () => await caller.byId({ id: "2" });

    // Assert
    await expect(actAsync()).rejects.toThrow("App not found");
  });
});

describe("create should create a new app with all arguments", () => {
  test("should create a new app", async () => {
    // Arrange
    const db = createDb();
    const userId = createId();
    await db.insert(users).values({ id: userId, name: "creator" });
    const caller = appRouter.createCaller({
      db,
      deviceType: undefined,
      session: sessionForUser(userId, ["app-create"]),
    });
    const input = {
      name: "Mantine",
      description: "React components and hooks library",
      iconUrl: "https://mantine.dev/favicon.svg",
      href: "https://mantine.dev",
      pingUrl: "https://mantine.dev/a",
    };

    // Act
    await caller.create(input);

    // Assert
    const dbApp = await db.query.apps.findFirst();
    expect(dbApp).toBeDefined();
    expect(dbApp!.name).toBe(input.name);
    expect(dbApp!.description).toBe(input.description);
    expect(dbApp!.iconUrl).toBe(input.iconUrl);
    expect(dbApp!.href).toBe(input.href);
    expect(dbApp!.pingUrl).toBe(input.pingUrl);
    // The creator gets `full` control of the app they made.
    const grant = await db.query.appUserPermissions.findFirst({ where: eq(appUserPermissions.appId, dbApp!.id) });
    expect(grant?.userId).toBe(userId);
    expect(grant?.permission).toBe("full");
  });

  test("should create a new app only with required arguments", async () => {
    // Arrange
    const db = createDb();
    const userId = createId();
    await db.insert(users).values({ id: userId, name: "creator" });
    const caller = appRouter.createCaller({
      db,
      deviceType: undefined,
      session: sessionForUser(userId, ["app-create"]),
    });
    const input = {
      name: "Mantine",
      description: null,
      iconUrl: "https://mantine.dev/favicon.svg",
      href: null,
      pingUrl: "",
    };

    // Act
    await caller.create(input);

    // Assert
    const dbApp = await db.query.apps.findFirst();
    expect(dbApp).toBeDefined();
    expect(dbApp!.name).toBe(input.name);
    expect(dbApp!.description).toBe(input.description);
    expect(dbApp!.iconUrl).toBe(input.iconUrl);
    expect(dbApp!.href).toBe(input.href);
    expect(dbApp!.pingUrl).toBe(null);
  });
});

describe("create dedup (global, by name + href)", () => {
  test("identical name + URL references the existing shared app instead of duplicating", async () => {
    // Arrange: user A owns an existing app.
    const db = createDb();
    const userA = createId();
    const userB = createId();
    const appId = createId();
    await db.insert(users).values([
      { id: userA, name: "usera" },
      { id: userB, name: "userb" },
    ]);
    await db.insert(apps).values({ id: appId, name: "Google", iconUrl: "ic-a", href: "https://google.com" });
    await db.insert(appUserPermissions).values({ appId, userId: userA, permission: "full" });

    const caller = appRouter.createCaller({
      db,
      deviceType: undefined,
      session: sessionForUser(userB, ["app-create"]),
    });

    // Act: user B creates the same name + (normalized-equal) URL.
    const result = await caller.create({
      name: "Google",
      description: null,
      iconUrl: "ic-b",
      href: "https://google.com/", // trailing slash normalizes to the same identity
      pingUrl: "",
    });

    // Assert: no duplicate; referenced the existing record; B got `use` (not full).
    expect(result.referencedExisting).toBe(true);
    expect(result.appId).toBe(appId);
    expect((await db.query.apps.findMany()).length).toBe(1);
    const grants = await db.query.appUserPermissions.findMany({ where: eq(appUserPermissions.appId, appId) });
    expect(grants.find((g) => g.userId === userA)?.permission).toBe("full");
    expect(grants.find((g) => g.userId === userB)?.permission).toBe("use");
  });

  test("same name but different URL creates a distinct app (no dedup)", async () => {
    // Arrange
    const db = createDb();
    const userA = createId();
    const userB = createId();
    const appId = createId();
    await db.insert(users).values([
      { id: userA, name: "usera" },
      { id: userB, name: "userb" },
    ]);
    await db.insert(apps).values({ id: appId, name: "Google", iconUrl: "ic", href: "https://google.com" });
    await db.insert(appUserPermissions).values({ appId, userId: userA, permission: "full" });

    const caller = appRouter.createCaller({
      db,
      deviceType: undefined,
      session: sessionForUser(userB, ["app-create"]),
    });

    // Act: same display name, different URL -> a genuinely different app.
    const result = await caller.create({
      name: "Google",
      description: null,
      iconUrl: "ic",
      href: "https://google.co.uk",
      pingUrl: "",
    });

    // Assert: a new app exists (two total); B is its full owner.
    expect(result.referencedExisting).toBe(false);
    expect(result.appId).not.toBe(appId);
    expect((await db.query.apps.findMany()).length).toBe(2);
    const grants = await db.query.appUserPermissions.findMany({ where: eq(appUserPermissions.appId, result.appId) });
    expect(grants.find((g) => g.userId === userB)?.permission).toBe("full");
  });
});

describe("getDuplicateTagMap derives <owner>_<name> tags on name collisions", () => {
  test("tags colliding apps by their full-holder, omits uniquely-named apps", async () => {
    // Arrange: two apps named "Google" (different URLs, different owners) + one unique "Plex".
    const db = createDb();
    const userA = createId();
    const userB = createId();
    const google1 = createId();
    const google2 = createId();
    const plex = createId();
    await db.insert(users).values([
      { id: userA, name: "User A" },
      { id: userB, name: "User B" },
    ]);
    await db.insert(apps).values([
      { id: google1, name: "Google", iconUrl: "ic", href: "https://google.com" },
      { id: google2, name: "Google", iconUrl: "ic", href: "https://google.co.uk" },
      { id: plex, name: "Plex", iconUrl: "ic", href: "https://plex.tv" },
    ]);
    await db.insert(appUserPermissions).values([
      { appId: google1, userId: userA, permission: "full" },
      { appId: google2, userId: userB, permission: "full" },
      { appId: plex, userId: userA, permission: "full" },
    ]);

    const caller = appRouter.createCaller({
      db,
      deviceType: undefined,
      session: sessionForUser(userA, ["app-modify-all"]),
    });

    // Act
    const map = await caller.getDuplicateTagMap();

    // Assert: colliding "Google" apps tagged by owner; unique "Plex" omitted.
    expect(map[google1]).toBe("user_a_google");
    expect(map[google2]).toBe("user_b_google");
    expect(map[plex]).toBeUndefined();
  });

  test("requires the app-modify-all permission", async () => {
    const db = createDb();
    const caller = appRouter.createCaller({ db, deviceType: undefined, session: sessionForUser(createId(), []) });
    await expect(caller.getDuplicateTagMap()).rejects.toThrow("Permission denied");
  });
});

describe("update should update an app", () => {
  test("should update an app", async () => {
    // Arrange
    const db = createDb();
    const caller = appRouter.createCaller({
      db,
      deviceType: undefined,
      session: createDefaultSession(["app-modify-all"]),
    });

    const appId = createId();
    const toInsert = {
      id: appId,
      name: "Mantine",
      iconUrl: "https://mantine.dev/favicon.svg",
    };

    await db.insert(apps).values(toInsert);

    const input = {
      id: appId,
      name: "Mantine2",
      description: "React components and hooks library",
      iconUrl: "https://mantine.dev/favicon.svg2",
      href: "https://mantine.dev",
      pingUrl: "https://mantine.dev/a",
    };

    // Act
    await caller.update(input);

    // Assert
    const dbApp = await db.query.apps.findFirst();

    expect(dbApp).toBeDefined();
    expect(dbApp!.name).toBe(input.name);
    expect(dbApp!.description).toBe(input.description);
    expect(dbApp!.iconUrl).toBe(input.iconUrl);
    expect(dbApp!.href).toBe(input.href);
  });

  test("should throw an error if the app does not exist", async () => {
    // Arrange
    const db = createDb();
    const caller = appRouter.createCaller({
      db,
      deviceType: undefined,
      session: createDefaultSession(["app-modify-all"]),
    });

    // Act
    const actAsync = async () =>
      await caller.update({
        id: createId(),
        name: "Mantine",
        iconUrl: "https://mantine.dev/favicon.svg",
        description: null,
        href: null,
        pingUrl: "",
      });

    // Assert
    await expect(actAsync()).rejects.toThrow("App not found");
  });
});

describe("delete should delete an app", () => {
  test("should delete an app", async () => {
    // Arrange
    const db = createDb();
    const caller = appRouter.createCaller({
      db,
      deviceType: undefined,
      session: createDefaultSession(["app-full-all"]),
    });

    const appId = createId();
    await db.insert(apps).values({
      id: appId,
      name: "Mantine",
      iconUrl: "https://mantine.dev/favicon.svg",
    });

    // Act
    await caller.delete({ id: appId });

    // Assert
    const dbApp = await db.query.apps.findFirst();
    expect(dbApp).toBeUndefined();
  });
});
