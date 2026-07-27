import type { Session } from "@homarr/auth";
import type { Database } from "@homarr/db";
import { eq, inArray } from "@homarr/db";
import {
  boardGroupPermissions,
  boards,
  boardUserPermissions,
  groupMembers,
  integrationGroupPermissions,
  integrationItems,
  integrationUserPermissions,
  items,
} from "@homarr/db/schema";

// RBAC: integrations are NOT visible to every logged-in user (that was the
// upstream Homarr behaviour, which handed every session the full integrations
// table including each one's internal url). This mirrors AppAccessControl, with
// one deliberate difference: there are two scopes, not one.
//
//   use    - what a user may consume. Explicit grants plus integrations bound to
//            an item on a board they can view, so a shared board's widgets keep
//            rendering for the people it was shared with.
//   manage - what a user may see listed under /manage/integrations. Explicit
//            grants and global keys only, with NO board limb: an integration url
//            is a credentialed internal endpoint, and merely being able to view a
//            public board carrying a Sonarr widget should not put that Sonarr
//            instance's url in an administration list.
export class IntegrationAccessControl {
  constructor(
    private db: Database,
    private user: Session["user"] | null,
  ) {}

  // "all" when the user holds a global grant, otherwise the concrete set of
  // integration ids. Exposed so the router's bulk reads can scope their queries
  // and never leak the full integrations table.
  async getVisibleIntegrationScopeAsync(): Promise<"all" | string[]> {
    if (this.hasGlobalIntegrationPermission()) {
      return "all";
    }

    const grantedIds = await this.getGrantedIntegrationIdsAsync();
    const boardIds = await this.getViewableBoardIdsAsync();
    if (boardIds.size === 0) return [...grantedIds];

    const boardItems = await this.db.query.items.findMany({
      where: inArray(items.boardId, [...boardIds]),
      columns: { id: true },
    });
    if (boardItems.length === 0) return [...grantedIds];

    const bindings = await this.db.query.integrationItems.findMany({
      where: inArray(
        integrationItems.itemId,
        boardItems.map((item) => item.id),
      ),
      columns: { integrationId: true },
    });
    bindings.forEach((binding) => grantedIds.add(binding.integrationId));

    return [...grantedIds];
  }

  // Manage scope: no board limb. See the class comment.
  async getManageableIntegrationScopeAsync(): Promise<"all" | string[]> {
    if (this.hasGlobalIntegrationPermission()) {
      return "all";
    }

    return [...(await this.getGrantedIntegrationIdsAsync())];
  }

  // Which of the given ids the caller is entitled to BIND to a board item.
  //
  // Deliberately the grant-only scope, not the visible one. The visible scope
  // includes integrations reachable through a viewable board, so using it here
  // would be circular: bind an integration to an item on your own board and it
  // becomes "visible", which would retroactively authorise the bind.
  async filterBindableIntegrationIdsAsync(integrationIds: string[]) {
    const scope = await this.getManageableIntegrationScopeAsync();
    if (scope === "all") return integrationIds;
    return integrationIds.filter((integrationId) => scope.includes(integrationId));
  }

  async canUserSeeIntegrationsAsync(integrationIds: string[]) {
    const scope = await this.getVisibleIntegrationScopeAsync();
    if (scope === "all") return true;
    return integrationIds.every((integrationId) => scope.includes(integrationId));
  }

  // Whether /manage/integrations has anything to show this user. A holder of
  // integration-create with no grants yet still belongs on the page, so callers
  // check that permission separately.
  async hasAnyManageableIntegrationAsync() {
    const scope = await this.getManageableIntegrationScopeAsync();
    return scope === "all" || scope.length > 0;
  }

  private hasGlobalIntegrationPermission() {
    const permissions = this.user?.permissions ?? [];
    return (
      permissions.includes("admin") ||
      permissions.includes("integration-use-all") ||
      permissions.includes("integration-interact-all") ||
      permissions.includes("integration-full-all")
    );
  }

  // Integrations granted directly to the user or to one of their groups.
  private async getGrantedIntegrationIdsAsync() {
    const integrationIds = new Set<string>();

    const userId = this.user?.id;
    if (!userId) return integrationIds;

    const userGrants = await this.db.query.integrationUserPermissions.findMany({
      where: eq(integrationUserPermissions.userId, userId),
      columns: { integrationId: true },
    });
    userGrants.forEach((grant) => integrationIds.add(grant.integrationId));

    const groupIds = await this.getGroupIdsAsync();
    if (groupIds.length > 0) {
      const groupGrants = await this.db.query.integrationGroupPermissions.findMany({
        where: inArray(integrationGroupPermissions.groupId, groupIds),
        columns: { integrationId: true },
      });
      groupGrants.forEach((grant) => integrationIds.add(grant.integrationId));
    }

    return integrationIds;
  }

  private async getGroupIdsAsync() {
    const userId = this.user?.id;
    if (!userId) return [];

    const memberships = await this.db.query.groupMembers.findMany({
      where: eq(groupMembers.userId, userId),
      columns: { groupId: true },
    });
    return memberships.map((membership) => membership.groupId);
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

    const groupIds = await this.getGroupIdsAsync();
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
