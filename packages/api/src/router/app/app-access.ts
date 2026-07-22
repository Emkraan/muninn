import { TRPCError } from "@trpc/server";

import type { Session } from "@homarr/auth";
import { constructAppPermissions } from "@homarr/auth/shared";
import type { Database, SQL } from "@homarr/db";
import { eq, inArray } from "@homarr/db";
import { appGroupPermissions, appUserPermissions, groupMembers } from "@homarr/db/schema";
import type { AppPermission } from "@homarr/definitions";

/**
 * Throws NOT_FOUND if user is not allowed to perform action on app
 * @param ctx trpc router context
 * @param appWhere where clause for the app
 * @param permission permission required to perform action on app
 */
export const throwIfActionForbiddenAsync = async (
  ctx: { db: Database; session: Session | null },
  appWhere: SQL<unknown>,
  permission: AppPermission,
) => {
  const { db, session } = ctx;
  const groupsOfCurrentUser = await db.query.groupMembers.findMany({
    where: eq(groupMembers.userId, session?.user.id ?? ""),
  });
  const app = await db.query.apps.findFirst({
    where: appWhere,
    columns: {
      id: true,
    },
    with: {
      userPermissions: {
        where: eq(appUserPermissions.userId, session?.user.id ?? ""),
      },
      groupPermissions: {
        where: inArray(
          appGroupPermissions.groupId,
          groupsOfCurrentUser.map((group) => group.groupId).concat(""),
        ),
      },
    },
  });

  if (!app) {
    notAllowed();
  }

  const { hasUseAccess, hasModifyAccess, hasFullAccess } = constructAppPermissions(app, session);

  if (hasFullAccess) {
    return; // As full access is required and user has full access, allow
  }

  if (["modify", "use"].includes(permission) && hasModifyAccess) {
    return; // As modify access is required and user has modify access, allow
  }

  if (permission === "use" && hasUseAccess) {
    return; // As use access is required and user has use access, allow
  }

  notAllowed();
};

/**
 * This method returns NOT_FOUND to prevent snooping on app existence
 * A function is used to use the method without return statement
 */
function notAllowed(): never {
  throw new TRPCError({
    code: "NOT_FOUND",
    message: "App not found",
  });
}
