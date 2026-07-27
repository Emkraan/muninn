import { TRPCError } from "@trpc/server";
import { z } from "zod/v4";

import { createId } from "@homarr/common";
import { createLogger } from "@homarr/core/infrastructure/logs";
import { and, asc, eq, likeInsensitive, startsWithInsensitive } from "@homarr/db";
import { getServerSettingByKeyAsync, updateServerSettingByKeyAsync } from "@homarr/db/queries";
import { searchEngines, users } from "@homarr/db/schema";
import { byIdSchema, paginatedSchema, searchSchema } from "@homarr/validation/common";
import { searchEngineEditSchema, searchEngineManageSchema } from "@homarr/validation/search-engine";

import { createTRPCRouter, permissionRequiredProcedure, protectedProcedure, publicProcedure } from "../../trpc";
import { IntegrationAccessControl } from "../integration/integration-access-control";

const logger = createLogger({ module: "searchEngineRouter" });

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
    // The joined integration carries a credentialed internal url, so it is
    // stripped unless the caller is actually entitled to that integration. This
    // procedure is public (the search bar renders before sign-in), which
    // previously handed the default engine's backing integration id, kind and
    // url to any anonymous visitor.
    const accessControl = new IntegrationAccessControl(ctx.db, ctx.session?.user ?? null);
    const withVisibleIntegration = async <TEngine extends { integration: { id: string } | null } | undefined>(
      searchEngine: TEngine,
    ) => {
      if (!searchEngine?.integration) return searchEngine;
      const visible = await accessControl.canUserSeeIntegrationsAsync([searchEngine.integration.id]);
      return visible ? searchEngine : { ...searchEngine, integration: null };
    };

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
    return await ctx.db.query.searchEngines.findMany({
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
  }),
  create: permissionRequiredProcedure
    .requiresPermission("search-engine-create")
    .input(searchEngineManageSchema)
    .mutation(async ({ ctx, input }) => {
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

      await ctx.db
        .update(searchEngines)
        .set({
          name: input.name,
          iconUrl: input.iconUrl,
          urlTemplate: "urlTemplate" in input ? input.urlTemplate : null,
          description: input.description,
          integrationId: "integrationId" in input ? input.integrationId : null,
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
