import SuperJSON from "superjson";

import type { Session } from "@homarr/auth";
import type { Database } from "@homarr/db";
import { eq, inArray, or } from "@homarr/db";
import { boardGroupPermissions, boards, boardUserPermissions, groupMembers, items } from "@homarr/db/schema";

import type { WidgetComponentProps } from "../../../../widgets/src";

// Emkraan RBAC: apps are NOT visible to every logged-in user (that was the
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

  async canUserSeeAppsAsync(appIds: string[]) {
    const permissions = this.user?.permissions ?? [];
    // Global grants that legitimately see every app.
    if (
      permissions.includes("admin") ||
      permissions.includes("app-use-all") ||
      permissions.includes("app-modify-all") ||
      permissions.includes("app-full-all") ||
      permissions.includes("board-view-all")
    ) {
      return true;
    }

    const accessibleAppIds = await this.getAccessibleAppIdsAsync();
    return appIds.every((appId) => accessibleAppIds.includes(appId));
  }

  // App ids placed on any board the current user is allowed to view.
  private async getAccessibleAppIdsAsync() {
    const viewableBoardIds = await this.getViewableBoardIdsAsync();
    if (viewableBoardIds.size === 0) return [];

    const itemsWithApps = await this.db.query.items.findMany({
      where: or(eq(items.kind, "app"), eq(items.kind, "bookmarks")),
      columns: { kind: true, options: true, boardId: true },
    });

    return itemsWithApps
      .filter((item) => viewableBoardIds.has(item.boardId))
      .flatMap((item) => {
        if (item.kind === "app") {
          const parsedOptions = SuperJSON.parse<WidgetComponentProps<"app">["options"]>(item.options);
          return [parsedOptions.appId];
        }

        const parsedOptions = SuperJSON.parse<WidgetComponentProps<"bookmarks">["options"]>(item.options);
        return parsedOptions.items;
      });
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
