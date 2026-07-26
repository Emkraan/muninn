import { TRPCError } from "@trpc/server";
import { z } from "zod/v4";

import { randomBytes } from "crypto";

import { hashPasswordAsync } from "@homarr/auth";
import { generateSecureRandomToken } from "@homarr/common/server";
import { and, db, eq } from "@homarr/db";
import { apiKeys } from "@homarr/db/schema";
import { getPermissionsWithChildren } from "@homarr/definitions";
import { apiKeyCreateSchema, apiKeyUpdateSchema } from "@homarr/validation/api-key";

import { createTRPCRouter, permissionRequiredProcedure, protectedProcedure } from "../trpc";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export const apiKeysRouter = createTRPCRouter({
  getAll: permissionRequiredProcedure
    .requiresPermission("other-manage-api-keys")
    .meta({
      openapi: {
        method: "GET",
        path: "/api/api-keys",
        tags: ["apiKeys"],
        protect: true,
      },
      mcp: { enabled: true, description: "List all API keys (admin only)" },
    })
    .output(
      z.array(
        z.object({
          id: z.string(),
          name: z.string(),
          scopes: z.string().nullable(),
          expiresAt: z.date().nullable(),
          createdAt: z.date(),
          lastUsedAt: z.date().nullable(),
          user: z.object({
            id: z.string(),
            name: z.string().nullable(),
            image: z.string().nullable(),
            email: z.string().nullable(),
          }),
        }),
      ),
    )
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
      openapi: {
        method: "POST",
        path: "/api/api-keys",
        tags: ["apiKeys"],
        protect: true,
      },
      mcp: {
        enabled: true,
        description:
          "Create a scoped API key for the current user. Input: name (string), scopes (permission keys, defaults to a read-only set), expiresInDays (number or null for never).",
      },
    })
    .input(apiKeyCreateSchema)
    .output(z.object({ apiKey: z.string() }))
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
  // Edit the scopes of an EXISTING key. Owner-bound: a caller may only edit
  // their own keys, and the same escalation guard as create applies, so a key
  // can never be widened beyond what its owner holds. Only the scopes column is
  // written; the key secret is never rotated (existing clients keep working).
  update: protectedProcedure
    .meta({
      openapi: { method: "PATCH", path: "/api/api-keys/{id}", tags: ["apiKeys"], protect: true },
      mcp: {
        enabled: true,
        description: "Update the scopes of one of your own API keys. Input: id (string), scopes (permission keys).",
      },
    })
    .input(apiKeyUpdateSchema)
    .output(z.void())
    .mutation(async ({ ctx, input }) => {
      const callerPermissions = new Set(ctx.session.user.permissions);
      const requestedPermissions = getPermissionsWithChildren(input.scopes);
      const escalating = requestedPermissions.filter((permission) => !callerPermissions.has(permission));
      if (escalating.length > 0) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: `Cannot grant an API key permissions you do not have: ${escalating.join(", ")}`,
        });
      }

      // Owner-bound: confirm the key exists AND belongs to the caller before writing.
      const existing = await db.query.apiKeys.findFirst({
        where: and(eq(apiKeys.id, input.id), eq(apiKeys.userId, ctx.session.user.id)),
        columns: { id: true },
      });
      if (!existing) {
        throw new TRPCError({ code: "NOT_FOUND", message: "API key not found" });
      }

      await db
        .update(apiKeys)
        .set({ scopes: JSON.stringify(input.scopes) })
        .where(eq(apiKeys.id, input.id));
    }),
  delete: permissionRequiredProcedure
    .requiresPermission("other-manage-api-keys")
    .meta({
      openapi: {
        method: "DELETE",
        path: "/api/api-keys/{apiKeyId}",
        tags: ["apiKeys"],
        protect: true,
      },
      mcp: {
        enabled: true,
        description: "Delete an API key by ID (admin only). REQUIRED: apiKeyId (string)",
      },
    })
    .input(z.object({ apiKeyId: z.string() }))
    .output(z.void())
    .mutation(async ({ ctx, input }) => {
      // NB: no `.limit(1)` here. `apiKeys.id` is the primary key so the WHERE
      // already matches at most one row, and `DELETE ... LIMIT` is a syntax
      // error on postgres (it is only tolerated by this better-sqlite3 build),
      // which made this mutation reject on the shared-postgres deployment.
      await ctx.db.delete(apiKeys).where(eq(apiKeys.id, input.apiKeyId));
    }),
});
