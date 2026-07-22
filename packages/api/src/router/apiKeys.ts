import { TRPCError } from "@trpc/server";
import { z } from "zod/v4";

import { randomBytes } from "crypto";

import { hashPasswordAsync } from "@homarr/auth";
import { generateSecureRandomToken } from "@homarr/common/server";
import { db, eq } from "@homarr/db";
import { apiKeys } from "@homarr/db/schema";
import { getPermissionsWithChildren } from "@homarr/definitions";
import { apiKeyCreateSchema } from "@homarr/validation/api-key";

import { createTRPCRouter, permissionRequiredProcedure, protectedProcedure } from "../trpc";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export const apiKeysRouter = createTRPCRouter({
  getAll: permissionRequiredProcedure
    .requiresPermission("admin")
    .meta({
      mcp: { enabled: true, description: "List all API keys (admin only)" },
    })
    .query(() => {
      return db.query.apiKeys.findMany({
        columns: {
          id: true,
          name: true,
          scopes: true,
          expiresAt: true,
          createdAt: true,
          lastUsedAt: true,
          apiKey: false,
        },
        with: {
          user: {
            columns: {
              id: true,
              name: true,
              image: true,
              email: true,
            },
          },
        },
      });
    }),
  // Decoupled from the "admin" permission: any authenticated user may mint a key,
  // but only for scopes they themselves hold (validated below) and always bound
  // to their own userId. This fits the per-user Access model - a key can never
  // grant more than its creator already has.
  create: protectedProcedure
    .meta({
      mcp: {
        enabled: true,
        description:
          "Create a scoped API key for the current user. Input: name (string), scopes (permission keys, defaults to a read-only set), expiresInDays (number or null for never).",
      },
    })
    .input(apiKeyCreateSchema)
    .mutation(async ({ ctx, input }) => {
      // Privilege-escalation guard: every requested scope (and its implied
      // children) must be covered by the caller's own live permissions.
      const callerPermissions = new Set(ctx.session.user.permissions);
      const requestedPermissions = getPermissionsWithChildren(input.scopes);
      const escalating = requestedPermissions.filter((permission) => !callerPermissions.has(permission));
      if (escalating.length > 0) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: `Cannot create an API key with permissions you do not have: ${escalating.join(", ")}`,
        });
      }

      const id = randomBytes(4).toString("hex");
      const token = generateSecureRandomToken(24);
      const hashedToken = await hashPasswordAsync(token);
      const expiresAt =
        input.expiresInDays === null || input.expiresInDays === undefined
          ? null
          : new Date(Date.now() + input.expiresInDays * MS_PER_DAY);

      await db.insert(apiKeys).values({
        id,
        apiKey: hashedToken,
        userId: ctx.session.user.id,
        name: input.name,
        // Persist the explicitly requested scopes (not the expanded set) as JSON.
        scopes: JSON.stringify(input.scopes),
        expiresAt,
      });
      return {
        apiKey: `${id}.${token}`,
      };
    }),
  delete: permissionRequiredProcedure
    .requiresPermission("admin")
    .meta({
      mcp: {
        enabled: true,
        description: "Delete an API key by ID (admin only). REQUIRED: apiKeyId (string)",
      },
    })
    .input(z.object({ apiKeyId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db.delete(apiKeys).where(eq(apiKeys.id, input.apiKeyId)).limit(1);
    }),
});
