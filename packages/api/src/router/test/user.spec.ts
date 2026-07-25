import { describe, expect, it, test, vi } from "vitest";

import type { Session } from "@homarr/auth";
import { createId } from "@homarr/common";
import type { Database } from "@homarr/db";
import { eq } from "@homarr/db";
import { groupMembers, groupPermissions, groups, invites, onboarding, users } from "@homarr/db/schema";
import { createDb } from "@homarr/db/test";
import type { GroupPermissionKey, OnboardingStep } from "@homarr/definitions";
import { getPermissionsWithChildren } from "@homarr/definitions";

import { userRouter } from "../user";

const defaultOwnerId = createId();
const createSession = (permissions: GroupPermissionKey[]) =>
  ({
    user: {
      id: defaultOwnerId,
      permissions,
      colorScheme: "light",
    },
    expires: new Date().toISOString(),
  }) satisfies Session;
const defaultSession = createSession([]);

// Mock the auth module to return an empty session
vi.mock("@homarr/auth", async () => {
  const mod = await import("@homarr/auth/security");
  return { ...mod, auth: () => ({}) as Session };
});

// Mock the env module to return the credentials provider
vi.mock("@homarr/auth/env", () => {
  return {
    env: {
      AUTH_PROVIDERS: ["credentials"],
    },
  };
});

describe("initUser should initialize the first user", () => {
  it("should create a user if none exists", async () => {
    const db = createDb();
    await createOnboardingStepAsync(db, "user");
    const caller = userRouter.createCaller({
      db,
      deviceType: undefined,
      session: null,
    });

    await caller.initUser({
      username: "test",
      password: "123ABCdef+/-",
      confirmPassword: "123ABCdef+/-",
    });

    const user = await db.query.users.findFirst({
      columns: {
        id: true,
      },
    });

    expect(user).toBeDefined();
  });

  it("should not create a user if the password and confirmPassword do not match", async () => {
    const db = createDb();
    await createOnboardingStepAsync(db, "user");
    const caller = userRouter.createCaller({
      db,
      deviceType: undefined,
      session: null,
    });

    const actAsync = async () =>
      await caller.initUser({
        username: "test",
        password: "123ABCdef+/-",
        confirmPassword: "456ABCdef+/-",
      });

    await expect(actAsync()).rejects.toThrow("passwordsDoNotMatch");
  });

  it.each([["aB2%"], ["short"]])("should reject passwords shorter than 8 characters for '%s'", async (password) => {
    const db = createDb();
    await createOnboardingStepAsync(db, "user");
    const caller = userRouter.createCaller({
      db,
      deviceType: undefined,
      session: null,
    });

    const actAsync = async () =>
      await caller.initUser({
        username: "test",
        password,
        confirmPassword: password,
      });

    await expect(actAsync()).rejects.toThrow();
  });

  it("should accept passwords without complexity requirements", async () => {
    const db = createDb();
    await createOnboardingStepAsync(db, "user");
    const caller = userRouter.createCaller({
      db,
      deviceType: undefined,
      session: null,
    });

    await caller.initUser({
      username: "test",
      password: "abc123DEF",
      confirmPassword: "abc123DEF",
    });

    const user = await db.query.users.findFirst({
      columns: {
        id: true,
      },
    });

    expect(user).toBeDefined();
  });

  it("should accept passwords with special characters like LoveHomarr<3", async () => {
    const db = createDb();
    await createOnboardingStepAsync(db, "user");
    const caller = userRouter.createCaller({
      db,
      deviceType: undefined,
      session: null,
    });

    await caller.initUser({
      username: "test",
      password: "LoveHomarr<3",
      confirmPassword: "LoveHomarr<3",
    });

    const user = await db.query.users.findFirst({
      columns: {
        id: true,
      },
    });

    expect(user).toBeDefined();
  });
});

describe("register should create a user with valid invitation", () => {
  test("register should create a user with valid invitation", async () => {
    // Arrange
    const db = createDb();
    const caller = userRouter.createCaller({
      db,
      deviceType: undefined,
      session: null,
    });

    const userId = createId();
    const inviteId = createId();
    const inviteToken = "123";
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2024, 0, 3));

    await db.insert(users).values({
      id: userId,
    });
    await db.insert(invites).values({
      id: inviteId,
      token: inviteToken,
      creatorId: userId,
      expirationDate: new Date(2024, 0, 5),
    });

    // Act
    await caller.register({
      inviteId,
      token: inviteToken,
      username: "test",
      password: "123ABCdef+/-",
      confirmPassword: "123ABCdef+/-",
    });

    // Assert
    const user = await db.query.users.findMany({
      columns: {
        name: true,
      },
    });
    const invite = await db.query.invites.findMany({
      columns: {
        id: true,
      },
    });

    expect(user).toHaveLength(2);
    expect(invite).toHaveLength(0);
  });

  test.each([
    [{ token: "fakeToken" }, new Date(2024, 0, 3)],
    [{ inviteId: "fakeInviteId" }, new Date(2024, 0, 3)],
    [{}, new Date(2024, 0, 5, 0, 0, 1)],
  ])(
    "register should throw an error with input %s and date %s if the invitation is invalid",
    async (partialInput, systemTime) => {
      // Arrange
      const db = createDb();
      const caller = userRouter.createCaller({
        db,
        deviceType: undefined,
        session: null,
      });

      const userId = createId();
      const inviteId = createId();
      const inviteToken = "123";
      vi.useFakeTimers();
      vi.setSystemTime(systemTime);

      await db.insert(users).values({
        id: userId,
      });
      await db.insert(invites).values({
        id: inviteId,
        token: inviteToken,
        creatorId: userId,
        expirationDate: new Date(2024, 0, 5),
      });

      // Act
      const actAsync = async () =>
        await caller.register({
          inviteId,
          token: inviteToken,
          username: "test",
          password: "123ABCdef+/-",
          confirmPassword: "123ABCdef+/-",
          ...partialInput,
        });

      // Assert
      await expect(actAsync()).rejects.toThrow("Invalid invite");
    },
  );
});

describe("editProfile shoud update user", () => {
  test("editProfile should update users and not update emailVerified when email not dirty", async () => {
    // arrange
    const db = createDb();
    const caller = userRouter.createCaller({
      db,
      deviceType: undefined,
      session: defaultSession,
    });

    const emailVerified = new Date(2024, 0, 5);

    await db.insert(users).values({
      id: defaultOwnerId,
      name: "TEST 1",
      email: "abc@gmail.com",
      emailVerified,
    });

    // act
    await caller.editProfile({
      id: defaultOwnerId,
      name: "ABC",
      email: "",
    });

    // assert
    const user = await db.select().from(users).where(eq(users.id, defaultOwnerId));

    expect(user).toHaveLength(1);
    expect(user[0]).containSubset({
      id: defaultOwnerId,
      name: "abc",
      email: "abc@gmail.com",
      emailVerified,
    });
  });

  test("editProfile should update users and update emailVerified when email dirty", async () => {
    // arrange
    const db = createDb();
    const caller = userRouter.createCaller({
      db,
      deviceType: undefined,
      session: defaultSession,
    });

    await db.insert(users).values({
      id: defaultOwnerId,
      name: "TEST 1",
      email: "abc@gmail.com",
      emailVerified: new Date(2024, 0, 5),
    });

    // act
    await caller.editProfile({
      id: defaultOwnerId,
      name: "ABC",
      email: "myNewEmail@gmail.com",
    });

    // assert
    const user = await db.select().from(users).where(eq(users.id, defaultOwnerId));

    expect(user).toHaveLength(1);
    expect(user[0]).containSubset({
      id: defaultOwnerId,
      name: "abc",
      email: "myNewEmail@gmail.com",
      emailVerified: null,
    });
  });
});

describe("delete should delete user", () => {
  test("delete should delete user", async () => {
    const db = createDb();
    const caller = userRouter.createCaller({
      db,
      deviceType: undefined,
      session: defaultSession,
    });

    const initialUsers = [
      {
        id: createId(),
        name: "User 1",
      },
      {
        id: defaultOwnerId,
        name: "User 2",
      },
      {
        id: createId(),
        name: "User 3",
      },
    ];

    await db.insert(users).values(initialUsers);

    await caller.delete({ userId: defaultOwnerId });

    const usersInDb = await db.select().from(users);
    expect(usersInDb).toHaveLength(2);
    expect(usersInDb[0]).containSubset(initialUsers[0]);
    expect(usersInDb[1]).containSubset(initialUsers[2]);
  });
});

describe("changeEnableRightClickOnWidgets should toggle the right-click preference", () => {
  test("non-admin can toggle their own preference", async () => {
    const db = createDb();
    const caller = userRouter.createCaller({
      db,
      deviceType: undefined,
      session: defaultSession,
    });

    await db.insert(users).values({
      id: defaultOwnerId,
      name: "owner",
    });

    await caller.changeEnableRightClickOnWidgets({ id: defaultOwnerId, enableRightClickOnWidgets: false });

    const updated = await db.query.users.findFirst({
      where: eq(users.id, defaultOwnerId),
      columns: { enableRightClickOnWidgets: true },
    });
    expect(updated?.enableRightClickOnWidgets).toBe(false);

    await caller.changeEnableRightClickOnWidgets({ id: defaultOwnerId, enableRightClickOnWidgets: true });

    const restored = await db.query.users.findFirst({
      where: eq(users.id, defaultOwnerId),
      columns: { enableRightClickOnWidgets: true },
    });
    expect(restored?.enableRightClickOnWidgets).toBe(true);
  });

  test("non-admin cannot toggle another user's preference", async () => {
    const db = createDb();
    const caller = userRouter.createCaller({
      db,
      deviceType: undefined,
      session: defaultSession,
    });

    const otherUserId = createId();
    await db.insert(users).values({ id: defaultOwnerId });
    await db.insert(users).values({ id: otherUserId, name: "other" });

    await expect(
      caller.changeEnableRightClickOnWidgets({ id: otherUserId, enableRightClickOnWidgets: false }),
    ).rejects.toThrow("User not found");

    const other = await db.query.users.findFirst({
      where: eq(users.id, otherUserId),
      columns: { enableRightClickOnWidgets: true },
    });
    expect(other?.enableRightClickOnWidgets).toBe(true);
  });

  test("admin can toggle another user's preference", async () => {
    const db = createDb();
    // A real admin session carries the expanded permission set (incl. other-manage-users).
    const adminSession = createSession(getPermissionsWithChildren(["admin"]));
    const caller = userRouter.createCaller({
      db,
      deviceType: undefined,
      session: adminSession,
    });

    const targetUserId = createId();
    await db.insert(users).values({ id: defaultOwnerId });
    await db.insert(users).values({ id: targetUserId, name: "target" });

    await caller.changeEnableRightClickOnWidgets({ id: targetUserId, enableRightClickOnWidgets: false });

    const target = await db.query.users.findFirst({
      where: eq(users.id, targetUserId),
      columns: { enableRightClickOnWidgets: true },
    });
    expect(target?.enableRightClickOnWidgets).toBe(false);
  });
});

describe("create should guard against group-based privilege escalation", () => {
  test("delegate with other-manage-users cannot create a user in a group holding permissions beyond their own", async () => {
    // Arrange
    const db = createDb();
    const delegateSession = createSession(getPermissionsWithChildren(["other-manage-users"]));
    const caller = userRouter.createCaller({ db, deviceType: undefined, session: delegateSession });

    const groupId = createId();
    await db.insert(groups).values({ id: groupId, name: "Admins", position: 1 });
    // The target group carries `admin`, which the delegate does not hold.
    await db.insert(groupPermissions).values({ groupId, permission: "admin" });

    // Act
    const actAsync = async () =>
      await caller.create({
        username: "escalated",
        password: "123ABCdef+/-",
        confirmPassword: "123ABCdef+/-",
        groupIds: [groupId],
      });

    // Assert: rejected, and the guard runs before user creation so no orphan
    // account or membership is left behind.
    await expect(actAsync()).rejects.toThrow("Cannot assign a group with permissions you do not have");
    const createdUser = await db.query.users.findFirst({ where: eq(users.name, "escalated") });
    expect(createdUser).toBeUndefined();
    const memberships = await db.query.groupMembers.findMany({ where: eq(groupMembers.groupId, groupId) });
    expect(memberships.length).toBe(0);
  });

  test("delegate with other-manage-users can create a user in a group whose permissions they hold", async () => {
    // Arrange
    const db = createDb();
    const delegateSession = createSession(getPermissionsWithChildren(["other-manage-users"]));
    const caller = userRouter.createCaller({ db, deviceType: undefined, session: delegateSession });

    const groupId = createId();
    await db.insert(groups).values({ id: groupId, name: "Viewers", position: 1 });
    // A permission the delegate itself holds - the assignment is allowed.
    await db.insert(groupPermissions).values({ groupId, permission: "other-manage-users" });

    // Act
    await caller.create({
      username: "scoped",
      password: "123ABCdef+/-",
      confirmPassword: "123ABCdef+/-",
      groupIds: [groupId],
    });

    // Assert
    const createdUser = await db.query.users.findFirst({ where: eq(users.name, "scoped") });
    expect(createdUser).toBeDefined();
    const memberships = await db.query.groupMembers.findMany({ where: eq(groupMembers.groupId, groupId) });
    expect(memberships.length).toBe(1);
  });
});

const createOnboardingStepAsync = async (db: Database, step: OnboardingStep) => {
  await db.insert(onboarding).values({
    id: createId(),
    step,
  });
};
