import { z } from "zod/v4";

import { asc, desc, lt } from "@homarr/db";
import { adminAudit } from "@homarr/db/schema";

import { verifyAuditChain } from "../audit";
import { createTRPCRouter, permissionRequiredProcedure } from "../trpc";

export const auditRouter = createTRPCRouter({
  /**
   * Paginated list of audit log entries, newest first.
   * Requires the `admin` permission.
   */
  list: permissionRequiredProcedure
    .requiresPermission("admin")
    .input(
      z.object({
        limit: z.number().min(1).max(200).default(50),
        cursor: z.number().optional(), // id of the last entry on the previous page
      }),
    )
    .output(
      z.object({
        entries: z.array(
          z.object({
            id: z.number(),
            timestamp: z.string(),
            userId: z.string(),
            userEmail: z.string(),
            action: z.string(),
            targetId: z.string().nullable(),
            detail: z.string().nullable(),
            prevHash: z.string().nullable(),
            hash: z.string(),
          }),
        ),
        nextCursor: z.number().nullable(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const { limit, cursor } = input;

      // Apply cursor in-query for efficiency; fetching limit+1 detects whether
      // a next page exists without a separate COUNT call.
      const rows = await ctx.db
        .select()
        .from(adminAudit)
        .where(cursor !== undefined ? lt(adminAudit.id, cursor) : undefined)
        .orderBy(desc(adminAudit.id))
        .limit(limit + 1);

      const hasNextPage = rows.length > limit;
      const page = hasNextPage ? rows.slice(0, limit) : rows;
      const nextCursor = hasNextPage ? (page[page.length - 1]?.id ?? null) : null;

      return {
        entries: page.map((r) => ({
          id: r.id,
          timestamp: r.timestamp instanceof Date ? r.timestamp.toISOString() : String(r.timestamp),
          userId: r.userId,
          userEmail: r.userEmail,
          action: r.action,
          targetId: r.targetId ?? null,
          detail: r.detail ?? null,
          prevHash: r.prevHash ?? null,
          hash: r.hash,
        })),
        nextCursor,
      };
    }),

  /**
   * Verify the integrity of the full audit chain.
   * Requires the `admin` permission.
   */
  verify: permissionRequiredProcedure
    .requiresPermission("admin")
    .input(z.undefined())
    .output(
      z.object({
        ok: z.boolean(),
        totalEntries: z.number(),
        firstBrokenId: z.number().nullable(),
      }),
    )
    .query(async ({ ctx }) => {
      return verifyAuditChain(ctx.db);
    }),
});
