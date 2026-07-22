import SuperJSON from "superjson";

import type { Session } from "@homarr/auth";
import type { Database } from "@homarr/db";
import { and, eq, inArray, or } from "@homarr/db";
import {
  appGroupPermissions,
  appUserPermissions,
  boardGroupPermissions,
  boards,
  boardUserPermissions,
  groupMembers,
  items,
} from "@homarr/db/schema";

import type { WidgetComponentProps } from "../../../../widgets/src";

// RBAC: apps are NOT visible to every logged-in user (that was the
// upstream Homarr behaviour). A user may see an app only if they hold a global
// app permission, OR the app is placed on a board they can view (public, their
// own, or explicitly granted to them / one of their groups). This mirrors the
// board-access model used by the board router and the integration-query
// permissions, so "nothing is shared by default" holds for apps too.
export class AppAccessControl {
  constructor(
    private db: Database,
    private user: Session["user"] | null,
  ) {}

  async canUserSeeAppAsync(appId: string) {
    return await this.canUserSeeAppsAsync([appId]);
  }

  // "all" when the user holds a global grant, otherwise the concrete set of app
  // ids the user may see (apps placed on boards they can view). Exposed so the
  // router's bulk-read endpoints (all/getPaginated/search/selectable) can scope
  // their queries and never leak the full app table.
  async getVisibleAppScopeAsync(): Promise<"all" | string[]> {
    const permissions = this.user?.permissions ?? [];
    if (
      permissions.includes("admin") ||
      permissions.includes("app-use-all") ||
      permissions.includes("app-modify-all") ||
      permissions.includes("app-full-all") ||
      permissions.includes("board-view-all")
    ) {
      return "all";
    }
    return await this.getAccessibleAppIdsAsync();
  }

  async canUserSeeAppsAsync(appIds: string[]) {
    const scope = await this.getVisibleAppScopeAsync();
    if (scope === "all") return true;
    return appIds.every((appId) => scope.includes(appId));
  }

  // App ids the current user may see: the union of apps granted directly to
  // them / one of their groups (per-app sharing, mirroring board/integration
  // sharing) and apps placed on any board they are allowed to view.
  private async getAccessibleAppIdsAsync() {
    const appIds = new Set<string>();

    // Directly-granted apps (per-user + per-group).
    const userId = this.user?.id;
    if (userId) {
      const userGrants = await this.db.query.appUserPermissions.findMany({
        where: eq(appUserPermissions.userId, userId),
        columns: { appId: true },
      });
      userGrants.forEach((grant) => appIds.add(grant.appId));

      const memberships = await this.db.query.groupMembers.findMany({
        where: eq(groupMembers.userId, userId),
        columns: { groupId: true },
      });
      const groupIds = memberships.map((membership) => membership.groupId);
      if (groupIds.length > 0) {
        const groupGrants = await this.db.query.appGroupPermissions.findMany({
          where: inArray(appGroupPermissions.groupId, groupIds),
          columns: { appId: true },
        });
        groupGrants.forEach((grant) => appIds.add(grant.appId));
      }
    }

    // Apps placed on any board the current user is allowed to view. The items
    // query is scoped to the viewable board ids (no whole-table scan).
    const viewableBoardIds = await this.getViewableBoardIdsAsync();
    if (viewableBoardIds.size > 0) {
      const itemsWithApps = await this.db.query.items.findMany({
        where: and(
          inArray(items.boardId, [...viewableBoardIds]),
          or(eq(items.kind, "app"), eq(items.kind, "bookmarks")),
        ),
        columns: { kind: true, options: true, boardId: true },
      });

      itemsWithApps.forEach((item) => {
        if (item.kind === "app") {
          const parsedOptions = SuperJSON.parse<WidgetComponentProps<"app">["options"]>(item.options);
          appIds.add(parsedOptions.appId);
          return;
        }

        const parsedOptions = SuperJSON.parse<WidgetComponentProps<"bookmarks">["options"]>(item.options);
        parsedOptions.items.forEach((id) => appIds.add(id));
      });
    }

    return [...appIds];
  }

  // Board ids this user can view: public + (when authenticated) their own +
  // boards granted directly to them or to any group they belong to.
  private async getViewableBoardIdsAsync(): Promise<Set<string>> {
    const publicBoards = await this.db.query.boards.findMany({
      where: eq(boards.isPublic, true),
      columns: { id: true },
    });
    const ids = new Set(publicBoards.map((board) => board.id));

    const userId = this.user?.id;
    if (!userId) return ids;

    const ownBoards = await this.db.query.boards.findMany({
      where: eq(boards.creatorId, userId),
      columns: { id: true },
    });
    ownBoards.forEach((board) => ids.add(board.id));

    const userGrants = await this.db.query.boardUserPermissions.findMany({
      where: eq(boardUserPermissions.userId, userId),
      columns: { boardId: true },
    });
    userGrants.forEach((grant) => ids.add(grant.boardId));

    const memberships = await this.db.query.groupMembers.findMany({
      where: eq(groupMembers.userId, userId),
      columns: { groupId: true },
    });
    const groupIds = memberships.map((membership) => membership.groupId);
    if (groupIds.length > 0) {
      const groupGrants = await this.db.query.boardGroupPermissions.findMany({
        where: inArray(boardGroupPermissions.groupId, groupIds),
        columns: { boardId: true },
      });
      groupGrants.forEach((grant) => ids.add(grant.boardId));
    }

    return ids;
  }
}
