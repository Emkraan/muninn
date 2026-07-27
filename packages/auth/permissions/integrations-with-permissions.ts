import type { Session } from "next-auth";

import { db, eq, inArray } from "@homarr/db";
import { groupMembers, integrationGroupPermissions, integrationUserPermissions } from "@homarr/db/schema";

import { constructIntegrationPermissions } from "./integration-permissions";

export const getIntegrationsWithPermissionsAsync = async (session: Session | null) => {
  const groupIds = session?.user.id
    ? await db.query.groupMembers
        .findMany({
          where: eq(groupMembers.userId, session.user.id),
          columns: { groupId: true },
        })
        .then((memberships) => memberships.map((membership) => membership.groupId))
    : [];

  const integrations = await db.query.integrations.findMany({
    columns: {
      id: true,
      name: true,
      url: true,
      kind: true,
    },
    with: {
      userPermissions: {
        where: eq(integrationUserPermissions.userId, session?.user.id ?? ""),
      },
      groupPermissions:
        groupIds.length > 0
          ? { where: inArray(integrationGroupPermissions.groupId, groupIds) }
          : { where: eq(integrationGroupPermissions.groupId, "") },
    },
  });

  return (
    integrations
      .map(({ userPermissions, groupPermissions, ...integration }) => ({
        ...integration,
        permissions: constructIntegrationPermissions({ userPermissions, groupPermissions }, session),
      }))
      // This result is serialised into the board page payload, so an integration
      // the caller cannot use has no business being in it - previously every
      // integration's name and internal url shipped to every board viewer,
      // including anonymous ones on a public board. Every consumer of the
      // context filters by at least use access (see integration-provider.tsx),
      // so nothing that was actually rendered is lost.
      //
      // Safe as the weakest level because session permission arrays arrive
      // pre-expanded (see callbacks.ts): integration-full-all resolves through
      // integration-interact-all down to integration-use-all.
      .filter((integration) => integration.permissions.hasUseAccess)
  );
};
