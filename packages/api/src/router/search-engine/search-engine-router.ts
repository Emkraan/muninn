import { TRPCError } from "@trpc/server";
import { z } from "zod/v4";

import type { Session } from "@homarr/auth";
import { createId } from "@homarr/common";
import { createLogger } from "@homarr/core/infrastructure/logs";
import type { Database } from "@homarr/db";
import { and, asc, eq, likeInsensitive, startsWithInsensitive } from "@homarr/db";
import { getServerSettingByKeyAsync, updateServerSettingByKeyAsync } from "@homarr/db/queries";
import { searchEngines, users } from "@homarr/db/schema";
import { byIdSchema, paginatedSchema, searchSchema } from "@homarr/validation/common";
import { searchEngineEditSchema, searchEngineManageSchema } from "@homarr/validation/search-engine";

import { createTRPCRouter, permissionRequiredProcedure, protectedProcedure, publicProcedure } from "../../trpc";
import { IntegrationAccessControl } from "../integration/integration-access-control";

const logger = createLogger({ module: "searchEngineRouter" });

// A search engine of type "fromIntegration" joins its backing integration, which
// carries a credentialed internal url. Holding a search-engine permission is not
// the same as being entitled to that integration, so the join is stripped for
// callers outside the integration's visibility scope. Returns a reusable
// stripper so one access-control instance is shared across a request.
const createIntegrationStripper = (ctx: { db: Database; session: Session | null }) => {
  const accessControl = new IntegrationAccessControl(ctx.db, ctx.session?.user ?? null);
  return async <TEngine extends { integration: { id: string } | null } | undefined>(searchEngine: TEngine) => {
    if (!searchEngine?.integration) return searchEngine;
    const visible = await accessControl.canUserSeeIntegrationsAsync([searchEngine.integration.id]);
    return visible ? searchEngine : { ...searchEngine, integration: null };
  };
};

// Binding an integration to a search engine must not be a way around integration
// permissions. The data path (integration.searchInIntegration) is separately
// gated, so this is about not letting a user create a reference they can never
// use, and not leaking which integrations exist.
const throwIfIntegrationNotUsableAsync = async (
  ctx: { db: Database; session: Session | null },
  integrationId: string | null | undefined,
) => {
  if (!integrationId) return;
  const allowed = await new IntegrationAccessControl(
    ctx.db,
    ctx.session?.user ?? null,
  ).filterBindableIntegrationIdsAsync([integrationId]);
  if (allowed.length === 0) {
    throw new TRPCError({ code: "FORBIDDEN", message: `No access to integration: ${integrationId}` });
  }
};

export const searchEngineRouter = createTRPCRouter({
  getPaginated: protectedProcedure.input(paginatedSchema).query(async ({ input, ctx }) => {
    const whereQuery = input.search ? likeInsensitive(searchEngines.name, input.search) : undefined;
    const searchEngineCount = await ctx.db.$count(searchEngines, whereQuery);

    const dbSearachEngines = await ctx.db.query.searchEngines.findMany({
      limit: input.pageSize,
      offset: (input.page - 1) * input.pageSize,
      where: whereQuery,
    });

    return {
      items: dbSearachEngines,
      totalCount: searchEngineCount,
    };
  }),
  getSelectable: protectedProcedure
    .input(z.object({ withIntegrations: z.boolean() }).default({ withIntegrations: true }))
    .query(async ({ ctx, input }) => {
      return await ctx.db.query.searchEngines
        .findMany({
          orderBy: asc(searchEngines.name),
          where: input.withIntegrations ? undefined : eq(searchEngines.type, "generic"),
          columns: {
            id: true,
            name: true,
          },
        })
        .then((engines) => engines.map((engine) => ({ value: engine.id, label: engine.name })));
    }),

  byId: protectedProcedure.input(byIdSchema).query(async ({ ctx, input }) => {
    const searchEngine = await ctx.db.query.searchEngines.findFirst({
      where: eq(searchEngines.id, input.id),
    });

    if (!searchEngine) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Search engine not found",
      });
    }

    return searchEngine.type === "fromIntegration"
      ? {
          ...searchEngine,
          type: "fromIntegration" as const,
          // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
          integrationId: searchEngine.integrationId!,
        }
      : {
          ...searchEngine,
          type: "generic" as const,
          // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
          urlTemplate: searchEngine.urlTemplate!,
        };
  }),
  getDefaultSearchEngine: publicProcedure.query(async ({ ctx }) => {
    const withVisibleIntegration = createIntegrationStripper(ctx);

    const userDefaultId = ctx.session?.user.id
      ? ((await ctx.db.query.users
          .findFirst({
            where: eq(users.id, ctx.session.user.id),
            columns: {
              defaultSearchEngineId: true,
            },
          })
          .then((user) => user?.defaultSearchEngineId)) ?? null)
      : null;

    if (userDefaultId) {
      return await withVisibleIntegration(
        await ctx.db.query.searchEngines.findFirst({
          where: eq(searchEngines.id, userDefaultId),
          with: {
            integration: {
              columns: {
                kind: true,
                url: true,
                id: true,
              },
            },
          },
        }),
      );
    }

    const searchSettings = await getServerSettingByKeyAsync(ctx.db, "search");

    if (!searchSettings.defaultSearchEngineId) return null;

    const serverDefault = await ctx.db.query.searchEngines.findFirst({
      where: eq(searchEngines.id, searchSettings.defaultSearchEngineId),
      with: {
        integration: {
          columns: {
            kind: true,
            url: true,
            id: true,
          },
        },
      },
    });

    if (serverDefault) return await withVisibleIntegration(serverDefault);

    // Remove the default search engine ID from settings if it does not longer exist
    try {
      await updateServerSettingByKeyAsync(ctx.db, "search", {
        ...searchSettings,
        defaultSearchEngineId: null,
      });
    } catch (error) {
      logger.warn(
        new Error("Failed to update search settings after default search engine not found", { cause: error }),
      );
    }

    return null;
  }),
  search: publicProcedure.input(searchSchema).query(async ({ ctx, input }) => {
    const withVisibleIntegration = createIntegrationStripper(ctx);
    const results = await ctx.db.query.searchEngines.findMany({
      // Public dashboards have no session: restrict anonymous users to generic
      // (non-integration) engines so custom search engines work there too (#4132),
      // while integration-backed engines stay available only when signed in.
      where: and(
        startsWithInsensitive(searchEngines.short, input.query),
        ctx.session?.user ? undefined : eq(searchEngines.type, "generic"),
      ),
      with: {
        integration: {
          columns: {
            kind: true,
            url: true,
            id: true,
          },
        },
      },
      limit: input.limit,
    });

    // Being signed in was the only requirement here, so any user could read the
    // kind and internal url of every integration backing a search engine.
    return await Promise.all(results.map(withVisibleIntegration));
  }),
  create: permissionRequiredProcedure
    .requiresPermission("search-engine-create")
    .input(searchEngineManageSchema)
    .mutation(async ({ ctx, input }) => {
      await throwIfIntegrationNotUsableAsync(ctx, "integrationId" in input ? input.integrationId : null);

      await ctx.db.insert(searchEngines).values({
        id: createId(),
        name: input.name,
        short: input.short.toLowerCase(),
        iconUrl: input.iconUrl,
        urlTemplate: "urlTemplate" in input ? input.urlTemplate : null,
        description: input.description,
        type: input.type,
        integrationId: "integrationId" in input ? input.integrationId : null,
      });
    }),
  update: permissionRequiredProcedure
    .requiresPermission("search-engine-modify-all")
    .input(searchEngineEditSchema)
    .mutation(async ({ ctx, input }) => {
      const searchEngine = await ctx.db.query.searchEngines.findFirst({
        where: eq(searchEngines.id, input.id),
      });

      if (!searchEngine) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Search engine not found",
        });
      }

      // Only a change of binding has to be earned, so an engine bound before this
      // rule existed keeps working when edited by someone without that grant.
      const nextIntegrationId = "integrationId" in input ? input.integrationId : null;
      if (nextIntegrationId !== searchEngine.integrationId) {
        await throwIfIntegrationNotUsableAsync(ctx, nextIntegrationId);
      }

      await ctx.db
        .update(searchEngines)
        .set({
          name: input.name,
          iconUrl: input.iconUrl,
          urlTemplate: "urlTemplate" in input ? input.urlTemplate : null,
          description: input.description,
          integrationId: nextIntegrationId,
          type: input.type,
        })
        .where(eq(searchEngines.id, input.id));
    }),
  delete: permissionRequiredProcedure
    .requiresPermission("search-engine-full-all")
    .input(byIdSchema)
    .mutation(async ({ ctx, input }) => {
      await ctx.db
        .update(users)
        .set({
          defaultSearchEngineId: null,
        })
        .where(eq(users.defaultSearchEngineId, input.id));
      await ctx.db.delete(searchEngines).where(eq(searchEngines.id, input.id));
    }),
});
