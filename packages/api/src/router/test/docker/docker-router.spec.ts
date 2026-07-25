import { TRPCError } from "@trpc/server";
import { describe, expect, test, vi } from "vitest";

import type { Session } from "@homarr/auth";
import { objectKeys } from "@homarr/common";
import type { Database } from "@homarr/db";
import type { GroupPermissionKey } from "@homarr/definitions";
import { getPermissionsWithChildren } from "@homarr/definitions";

import type { RouterInputs } from "../../..";
import { dockerRouter } from "../../docker/docker-router";

// Mock the auth module to return an empty session
vi.mock("@homarr/auth", () => ({ auth: () => ({}) as Session }));
vi.mock("@homarr/request-handler/docker", () => ({
  getContainerLogsAsync: async () => {
    await Promise.resolve();
    return "logs";
  },
  streamContainerLogsAsync: async () => {
    await Promise.resolve();
    return () => undefined;
  },
  dockerContainersRequestHandler: {
    handler: () => ({
      getDataAsync: async () => {
        return await Promise.resolve({ data: [], timestamp: new Date() });
      },
    }),
  },
}));
vi.mock("@homarr/docker/env", () => ({
  env: {
    ENABLE_DOCKER: true,
  },
}));

const createSessionWithPermissions = (...permissions: GroupPermissionKey[]) =>
  ({
    user: {
      id: "1",
      permissions,
      colorScheme: "light",
    },
    expires: new Date().toISOString(),
  }) satisfies Session;

const procedureKeys = objectKeys(dockerRouter._def.procedures);

const validInputs: {
  [key in (typeof procedureKeys)[number]]: RouterInputs["docker"][key];
} = {
  getContainers: undefined,
  startAll: { ids: ["1"] },
  stopAll: { ids: ["1"] },
  restartAll: { ids: ["1"] },
  removeAll: { ids: ["1"] },
  logs: { id: "1", tail: 200 },
  subscribeLogs: { id: "1", tail: 200 },
};

describe("All procedures should only be accessible for users with the manage-docker permission", () => {
  test.each(procedureKeys)("Procedure %s should be accessible for a full admin (expanded)", async (procedure) => {
    // A real admin session carries the expanded permission set (see
    // getCurrentUserPermissionsAsync), which includes other-manage-docker.
    const caller = dockerRouter.createCaller({
      db: null as unknown as Database,
      deviceType: undefined,
      session: createSessionWithPermissions(...getPermissionsWithChildren(["admin"])),
    });

    // Act
    const act = () => caller[procedure](validInputs[procedure] as never);

    await expect(act()).resolves.not.toThrow();
  });

  test.each(procedureKeys)(
    "Procedure %s should be accessible for a user with only the granular manage-docker permission",
    async (procedure) => {
      // Arrange
      const caller = dockerRouter.createCaller({
        db: null as unknown as Database,
        deviceType: undefined,
        session: createSessionWithPermissions("other-manage-docker"),
      });

      // Act
      const act = () => caller[procedure](validInputs[procedure] as never);

      await expect(act()).resolves.not.toThrow();
    },
  );

  test.each(procedureKeys)("Procedure %s should not be accessible with other permissions", async (procedure) => {
    // Arrange: every admin-implied permission EXCEPT the one docker now requires.
    const groupPermissionsWithoutDocker = getPermissionsWithChildren(["admin"]).filter(
      (permission) => permission !== "admin" && permission !== "other-manage-docker",
    );
    const caller = dockerRouter.createCaller({
      db: null as unknown as Database,
      deviceType: undefined,
      session: createSessionWithPermissions(...groupPermissionsWithoutDocker),
    });

    // Act
    const act = () => caller[procedure](validInputs[procedure] as never);

    await expect(act()).rejects.toThrow(new TRPCError({ code: "FORBIDDEN", message: "Permission denied" }));
  });

  test.each(procedureKeys)("Procedure %s should not be accessible without session", async (procedure) => {
    // Arrange
    const caller = dockerRouter.createCaller({
      db: null as unknown as Database,
      deviceType: undefined,
      session: null,
    });

    // Act
    const act = () => caller[procedure](validInputs[procedure] as never);

    await expect(act()).rejects.toThrow(new TRPCError({ code: "UNAUTHORIZED" }));
  });
});
