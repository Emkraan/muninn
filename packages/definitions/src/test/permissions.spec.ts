import { describe, expect, test } from "vitest";

import type { GroupPermissionKey } from "../permissions";
import { getPermissionsWithChildren, getPermissionsWithParents } from "../permissions";

describe("getPermissionsWithParents should return the correct permissions", () => {
  test.each([
    [["board-view-all"], ["board-view-all", "board-modify-all", "board-full-all", "admin"]],
    [["board-modify-all"], ["board-modify-all", "board-full-all", "admin"]],
    [["board-create"], ["board-create", "board-full-all", "admin"]],
    [["board-full-all"], ["board-full-all", "admin"]],
    [["integration-use-all"], ["integration-use-all", "integration-interact-all", "integration-full-all", "admin"]],
    [["integration-create"], ["integration-create", "integration-full-all", "admin"]],
    [["integration-interact-all"], ["integration-interact-all", "integration-full-all", "admin"]],
    [["integration-full-all"], ["integration-full-all", "admin"]],
    [["admin"], ["admin"]],
  ] satisfies [GroupPermissionKey[], GroupPermissionKey[]][])("expect %s to return %s", (input, expectedOutput) => {
    expect(getPermissionsWithParents(input)).toEqual(expect.arrayContaining(expectedOutput));
  });
});

describe("getPermissionsWithChildren should return the correct permissions", () => {
  test.each([
    [["board-view-all"], ["board-view-all"]],
    [["board-modify-all"], ["board-view-all", "board-modify-all"]],
    [["board-create"], ["board-create"]],
    [["board-full-all"], ["board-full-all", "board-modify-all", "board-view-all"]],
    [["integration-use-all"], ["integration-use-all"]],
    [["integration-create"], ["integration-create"]],
    [["integration-interact-all"], ["integration-interact-all", "integration-use-all"]],
    [["integration-full-all"], ["integration-full-all", "integration-interact-all", "integration-use-all"]],
    [
      ["admin"],
      [
        "admin",
        "board-full-all",
        "board-modify-all",
        "board-view-all",
        "integration-full-all",
        "integration-interact-all",
        "integration-use-all",
      ],
    ],
  ] satisfies [GroupPermissionKey[], GroupPermissionKey[]][])("expect %s to return %s", (input, expectedOutput) => {
    expect(getPermissionsWithChildren(input)).toEqual(expect.arrayContaining(expectedOutput));
  });
});

describe("admin keeps every fine-grained management capability", () => {
  // Security invariant: each granular "other-manage-*" capability MUST be a child
  // of "admin" so a full admin session (permissions expanded via
  // getPermissionsWithChildren) still passes every repointed gate. If any key is
  // missing here, admins silently lose access to that surface.
  const fineGrainedManageKeys = [
    "other-manage-users",
    "other-manage-groups",
    "other-manage-authentication",
    "other-manage-api-keys",
    "other-manage-certificates",
    "other-manage-backup",
    "other-manage-docker",
    "other-manage-kubernetes",
    "other-manage-tasks",
    "other-manage-settings",
  ] satisfies GroupPermissionKey[];

  test("getPermissionsWithChildren(['admin']) includes all 10 other-manage-* keys and view-logs", () => {
    const adminPermissions = getPermissionsWithChildren(["admin"]);
    expect(adminPermissions).toEqual(expect.arrayContaining([...fineGrainedManageKeys, "other-view-logs"]));
  });

  test.each(fineGrainedManageKeys)("admin implies %s", (key) => {
    expect(getPermissionsWithChildren(["admin"])).toContain(key);
  });
});
