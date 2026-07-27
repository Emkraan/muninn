import { isProviderEnabled } from "@homarr/auth/server";
import { db, eq, inArray, or } from "@homarr/db";
import {
  apps,
  boards,
  boardUserPermissions,
  groupMembers,
  groups,
  integrations,
  invites,
  medias,
  searchEngines,
  users,
} from "@homarr/db/schema";
import type { TranslationObject } from "@homarr/translation";

import { createTRPCRouter, publicProcedure } from "../trpc";
import { AppAccessControl } from "./app/app-access-control";
import { IntegrationAccessControl } from "./integration/integration-access-control";

// "all" counts the table; a concrete id list counts just those rows; an empty
// list short-circuits to 0 because inArray rejects an empty list.
const countInScopeAsync = async (
  table: Parameters<typeof db.$count>[0],
  idColumn: Parameters<typeof inArray>[0],
  scope: "all" | string[],
) => {
  if (scope === "all") return await db.$count(table);
  if (scope.length === 0) return 0;
  return await db.$count(table, inArray(idColumn, scope));
};

interface HomeStatistic {
  titleKey: keyof TranslationObject["management"]["page"]["home"]["statistic"];
  subtitleKey: keyof TranslationObject["management"]["page"]["home"]["statisticLabel"];
  count: number;
  path: string;
}

export const homeRouter = createTRPCRouter({
  getStats: publicProcedure.query(async ({ ctx }) => {
    const isAdmin = ctx.session?.user.permissions.includes("admin") ?? false;
    const isCredentialsEnabled = isProviderEnabled("credentials");

    const statistics: HomeStatistic[] = [];

    const boardIds: string[] = [];
    if (ctx.session?.user && !ctx.session.user.permissions.includes("board-view-all")) {
      const permissionsOfCurrentUserWhenPresent = await ctx.db.query.boardUserPermissions.findMany({
        where: eq(boardUserPermissions.userId, ctx.session.user.id),
      });

      const permissionsOfCurrentUserGroupsWhenPresent = await ctx.db.query.groupMembers.findMany({
        where: eq(groupMembers.userId, ctx.session.user.id),
        with: {
          group: {
            with: {
              boardPermissions: {},
            },
          },
        },
      });

      boardIds.push(
        ...permissionsOfCurrentUserWhenPresent
          .map((permission) => permission.boardId)
          .concat(
            permissionsOfCurrentUserGroupsWhenPresent
              .map((groupMember) => groupMember.group.boardPermissions.map((permission) => permission.boardId))
              .flat(),
          ),
      );
    }

    statistics.push({
      titleKey: "board",
      subtitleKey: "boards",
      count: await db.$count(
        boards,
        ctx.session?.user.permissions.includes("board-view-all")
          ? undefined
          : or(
              eq(boards.isPublic, true),
              eq(boards.creatorId, ctx.session?.user.id ?? ""),
              boardIds.length > 0 ? inArray(boards.id, boardIds) : undefined,
            ),
      ),
      path: "/manage/boards",
    });

    if (isAdmin) {
      statistics.push({
        titleKey: "user",
        subtitleKey: "authentication",
        count: await db.$count(users),
        path: "/manage/users",
      });
    }

    if (isAdmin && isCredentialsEnabled) {
      statistics.push({
        titleKey: "invite",
        subtitleKey: "authentication",
        count: await db.$count(invites),
        path: "/manage/users/invites",
      });
    }

    // Both tiles link straight to a page whose contents are access-scoped, so the
    // counts have to use the same scope. A raw table count told a user they had
    // resources that the page they landed on would never show them.
    if (ctx.session?.user) {
      const integrationScope = await new IntegrationAccessControl(
        db,
        ctx.session.user,
      ).getManageableIntegrationScopeAsync();
      const canSeeIntegrations =
        ctx.session.user.permissions.includes("integration-create") ||
        integrationScope === "all" ||
        integrationScope.length > 0;

      if (canSeeIntegrations) {
        statistics.push({
          titleKey: "integration",
          subtitleKey: "resources",
          // An empty scope is counted as 0 rather than passed to inArray, which
          // does not accept an empty list.
          count: await countInScopeAsync(integrations, integrations.id, integrationScope),
          path: "/manage/integrations",
        });
      }

      const appScope = await new AppAccessControl(db, ctx.session.user).getVisibleAppScopeAsync();
      statistics.push({
        titleKey: "app",
        subtitleKey: "resources",
        count: await countInScopeAsync(apps, apps.id, appScope),
        path: "/manage/apps",
      });
    }

    if (isAdmin) {
      statistics.push({
        titleKey: "group",
        subtitleKey: "authorization",
        count: await db.$count(groups),
        path: "/manage/users/groups",
      });
    }

    if (ctx.session?.user.permissions.includes("search-engine-create")) {
      statistics.push({
        titleKey: "searchEngine",
        subtitleKey: "resources",
        count: await db.$count(searchEngines),
        path: "/manage/search-engines",
      });
    }

    if (ctx.session?.user.permissions.includes("media-upload")) {
      statistics.push({
        titleKey: "media",
        subtitleKey: "resources",
        count: await db.$count(
          medias,
          ctx.session.user.permissions.includes("media-view-all")
            ? undefined
            : eq(medias.creatorId, ctx.session.user.id),
        ),
        path: "/manage/medias",
      });
    }

    return statistics;
  }),
});
