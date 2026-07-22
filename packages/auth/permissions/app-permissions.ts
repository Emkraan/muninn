import type { Session } from "next-auth";

import type { AppPermission } from "@homarr/definitions";

export interface AppPermissionsProps {
  userPermissions: {
    permission: AppPermission;
  }[];
  groupPermissions: {
    permission: AppPermission;
  }[];
}

export const constructAppPermissions = (app: AppPermissionsProps, session: Session | null) => {
  const permissions = app.userPermissions.concat(app.groupPermissions).map(({ permission }) => permission);

  return {
    hasFullAccess: (session?.user.permissions.includes("app-full-all") ?? false) || permissions.includes("full"),
    hasModifyAccess:
      permissions.includes("full") ||
      permissions.includes("modify") ||
      (session?.user.permissions.includes("app-modify-all") ?? false),
    hasUseAccess: permissions.length >= 1 || (session?.user.permissions.includes("app-use-all") ?? false),
  };
};
