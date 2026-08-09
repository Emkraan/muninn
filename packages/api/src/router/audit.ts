import { z } from "zod/v4";

import { and, asc, desc, gte, like, lt, lte } from "@homarr/db";
import { adminAudit } from "@homarr/db/schema";

import { verifyAuditChain } from "../audit";
import { createTRPCRouter, permissionRequiredProcedure } from "../trpc";

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

const toIso = (v: Date | number | string): string =>
  v instanceof Date ? v.toISOString() : new Date(v).toISOString();

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

export const auditRouter = createTRPCRouter({
  /**
   * Paginated list of audit log entries, newest first.
   *
   * Supports optional filters: actor email (prefix match), action (prefix
   * match), outcome, and date range. All filters are server-side and
   * parameterized. Requires the `other-audit-export` permission (admin implies it).
   */
  list: permissionRequiredProcedure
    .requiresPermission("other-audit-export")
    .input(
      z.object({
        limit: z.number().min(1).max(500).default(50),
        cursor: z.string().optional(), // CUID2 id of the last entry on the previous page
        // Optional filters (admin-hub-standard §2.4)
        actor: z.string().optional(), // email prefix/substring filter
        action: z.string().optional(), // action prefix/substring filter
        startDate: z.string().datetime().optional(),
        endDate: z.string().datetime().optional(),
      }),
    )
    .output(
      z.object({
        entries: z.array(
          z.object({
            id: z.string(),
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
        nextCursor: z.string().nullable(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const { limit, cursor, actor, action, startDate, endDate } = input;

      // Build the WHERE clause from all active filters.
      const conditions = [];
      if (cursor !== undefined) conditions.push(lt(adminAudit.id, cursor));
      if (actor) conditions.push(like(adminAudit.userEmail, `%${actor}%`));
      if (action) conditions.push(like(adminAudit.action, `%${action}%`));
      if (startDate) conditions.push(gte(adminAudit.timestamp, new Date(startDate)));
      if (endDate) conditions.push(lte(adminAudit.timestamp, new Date(endDate)));

      // Fetching limit+1 detects whether a next page exists without a separate COUNT.
      const rows = await ctx.db
        .select()
        .from(adminAudit)
        .where(conditions.length ? and(...conditions) : undefined)
        .orderBy(desc(adminAudit.id))
        .limit(limit + 1);

      const hasNextPage = rows.length > limit;
      const page = hasNextPage ? rows.slice(0, limit) : rows;
      const nextCursor = hasNextPage ? (page[page.length - 1]?.id ?? null) : null;

      return {
        entries: page.map((r) => ({
          id: r.id,
          timestamp: toIso(r.timestamp),
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
   * Aggregated statistics for the audit log (admin-hub-standard §2.4).
   *
   * Returns total entry count, per-day breakdowns, top actors, top actions,
   * outcome distribution, and most recent entries - all within a rolling window.
   * Requires the `other-audit-export` permission (admin implies it).
   */
  stats: permissionRequiredProcedure
    .requiresPermission("other-audit-export")
    .input(
      z.object({
        days: z.number().int().min(1).max(365).default(14),
      }),
    )
    .output(
      z.object({
        since: z.string(), // ISO timestamp of window start
        allTimeTotal: z.number(),
        total: z.number(), // within the requested window
        perDay: z.array(z.object({ date: z.string(), count: z.number() })),
        topActors: z.array(z.object({ email: z.string(), count: z.number() })),
        topActions: z.array(z.object({ action: z.string(), count: z.number() })),
        recent: z.array(
          z.object({
            id: z.string(),
            timestamp: z.string(),
            userEmail: z.string(),
            action: z.string(),
            targetId: z.string().nullable(),
          }),
        ),
      }),
    )
    .query(async ({ ctx, input }) => {
      const since = new Date(Date.now() - input.days * 24 * 60 * 60 * 1000);

      // All entries in the window (bounded to 10 000 to prevent runaway scans).
      const windowRows = await ctx.db
        .select()
        .from(adminAudit)
        .where(gte(adminAudit.timestamp, since))
        .orderBy(asc(adminAudit.timestamp))
        .limit(10_000);

      const allTimeTotal = await ctx.db.$count(adminAudit);

      // Per-day counts (date string YYYY-MM-DD keyed by UTC date).
      const dayMap = new Map<string, number>();
      for (const row of windowRows) {
        const day = toIso(row.timestamp).slice(0, 10);
        dayMap.set(day, (dayMap.get(day) ?? 0) + 1);
      }
      // Fill in days with zero counts for a continuous series.
      const perDay: { date: string; count: number }[] = [];
      for (let i = input.days - 1; i >= 0; i--) {
        const d = new Date(Date.now() - i * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
        perDay.push({ date: d, count: dayMap.get(d) ?? 0 });
      }

      // Top actors (up to 8).
      const actorMap = new Map<string, number>();
      for (const row of windowRows) {
        actorMap.set(row.userEmail, (actorMap.get(row.userEmail) ?? 0) + 1);
      }
      const topActors = [...actorMap.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 8)
        .map(([email, count]) => ({ email, count }));

      // Top actions (up to 10).
      const actionMap = new Map<string, number>();
      for (const row of windowRows) {
        actionMap.set(row.action, (actionMap.get(row.action) ?? 0) + 1);
      }
      const topActions = [...actionMap.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([action, count]) => ({ action, count }));

      // 8 most recent entries in the window.
      const recent = [...windowRows]
        .reverse()
        .slice(0, 8)
        .map((r) => ({
          id: r.id,
          timestamp: toIso(r.timestamp),
          userEmail: r.userEmail,
          action: r.action,
          targetId: r.targetId ?? null,
        }));

      return {
        since: since.toISOString(),
        allTimeTotal,
        total: windowRows.length,
        perDay,
        topActors,
        topActions,
        recent,
      };
    }),

  /**
   * Verify the integrity of the full audit chain (admin-hub-standard §2.4).
   * Requires the `other-audit-verify` permission (admin implies it).
   */
  verify: permissionRequiredProcedure
    .requiresPermission("other-audit-verify")
    .input(z.undefined())
    .output(
      z.object({
        ok: z.boolean(),
        totalEntries: z.number(),
        firstBrokenId: z.string().nullable(),
      }),
    )
    .mutation(async ({ ctx }) => {
      return verifyAuditChain(ctx.db);
    }),
});
