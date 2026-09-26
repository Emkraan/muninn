import { cookies } from "next/headers";
import dayjs from "dayjs";
import type { NextAuthConfig } from "next-auth";

import { createLogger } from "@homarr/core/infrastructure/logs";
import { and, eq, inArray, isNull } from "@homarr/db";
import type { Database } from "@homarr/db";
import { groupMembers, groups, users } from "@homarr/db/schema";
import { colorSchemeCookieKey, everyoneGroup } from "@homarr/definitions";

import { buildProfileName, extractProfileName } from "./providers/oidc/oidc-provider";
import { getOidcGroupConfigAsync, getOidcProviderRowByKeyAsync } from "./providers/oidc/load-db-providers";

const logger = createLogger({ module: "authEvents" });

// NextAuth ids for DB OIDC providers are "oidc-<key>"; recover the key.
const oidcKeyFromProvider = (provider: string | undefined): string | null =>
  provider?.startsWith("oidc-") ? provider.slice("oidc-".length) : null;

export const createSignInEventHandler = (db: Database): Exclude<NextAuthConfig["events"], undefined>["signIn"] => {
  return async ({ user, profile, account }) => {
    logger.debug(`SignIn EventHandler for user: ${JSON.stringify(user)} . profile: ${JSON.stringify(profile)}`);
    if (!user.id) throw new Error("User ID is missing");

    const dbUser = await db.query.users.findFirst({
      where: eq(users.id, user.id),
      columns: {
        name: true,
        image: true,
        colorScheme: true,
      },
    });

    if (!dbUser) throw new Error("User not found");

    // Group sync config now comes from the DB provider store (per provider),
    // replacing the retired AUTH_OIDC_* env vars.
    const oidcKey = oidcKeyFromProvider(account?.provider);
    const groupConfig = oidcKey ? await getOidcGroupConfigAsync(db, oidcKey) : null;
    const groupsKey = groupConfig?.groupsClaim ?? "groups";
    if (groupConfig && !groupConfig.groupsLocalManagement && profile) {
      // Authorization group RBAC standard (Emkraan authentik-broker-standard,
      // Rule 9): sync must match on the stable `group_ids` claim (Authentik
      // group pk uuids), never on the display-only `groups` names claim.
      //
      // Fail closed: a token without `group_ids` must not touch membership,
      // and must never fall back to matching by name. Per authentik-broker-standard
      // Rule 9, an EMPTY group_ids array is treated the same as an absent claim:
      // the app must not overwrite the cached/linked group membership with an
      // empty set (a transient IdP/claim-mapping glitch must not read as "remove
      // this user from every Authentik-linked group", which could include an
      // admin's own admin-granting group).
      if ("group_ids" in profile && Array.isArray(profile.group_ids) && profile.group_ids.length > 0) {
        logger.debug(`Using profile group_ids: ${JSON.stringify(profile.group_ids)}`);
        // One-time safe backfill: local groups that predate the group_ids
        // rollout have no stored Authentik id yet. Positionally pair the
        // stable group_ids claim with the display-only groups names claim
        // (both derive from the same request.user.groups.all() queryset on
        // the Authentik side, so index i of one corresponds to index i of the
        // other) and backfill any exact name match. After a group is
        // backfilled once, this is a no-op for it forever after.
        if (groupsKey in profile && Array.isArray(profile[groupsKey])) {
          await backfillExternalAuthentikGroupIdsByNameAsync(
            db,
            profile.group_ids as string[],
            profile[groupsKey] as string[],
          );
        }
        await synchronizeGroupsByExternalIdForUserAsync(db, user.id, profile.group_ids as string[]);
      } else {
        logger.info(
          "OIDC profile carried no (or an empty) group_ids claim; leaving group membership unchanged (fail closed per authentik-broker-standard Rule 9).",
          {
            userId: user.id,
            oidcKey,
            groupsKeyConfigured: groupsKey,
            groupIdsPresent: "group_ids" in profile,
          },
        );
      }
    }

    // In ldap-authroization we return the groups from ldap, it's not typed.
    if ("groups" in user && Array.isArray(user.groups)) {
      logger.debug(`Using profile groups: ${JSON.stringify(user.groups)}`);
      await synchronizeGroupsWithExternalForUserAsync(db, user.id, user.groups as string[]);
    }
    await addUserToEveryoneGroupIfNotMemberAsync(db, user.id);

    if (dbUser.name !== user.name) {
      await db.update(users).set({ name: user.name }).where(eq(users.id, user.id));
      logger.info("Username for user of credentials provider has changed.", {
        userId: user.id,
        oldName: dbUser.name,
        newName: user.name,
      });
    }

    if (profile) {
      // Resolve the display name and picture through the SAME per-provider path
      // used at account creation (buildProfileName / pictureClaim over the DB
      // provider row), so a login never overwrites the stored value with one
      // computed from a different (global/env) rule. Fall back to the env-based
      // extractProfileName / profile.picture only when the provider row cannot
      // be resolved (e.g. non-DB / legacy flows). Never throw: sub is always
      // present (account creation already required it), so a name resolves.
      const providerRow = oidcKey ? await getOidcProviderRowByKeyAsync(db, oidcKey) : null;
      const profileUsername =
        (providerRow ? buildProfileName(providerRow, profile) : extractProfileName(profile)) ??
        profile.email ??
        profile.sub;

      if (profileUsername && dbUser.name !== profileUsername) {
        await db.update(users).set({ name: profileUsername }).where(eq(users.id, user.id));
        logger.info("Username for user of oidc provider has changed.", {
          userId: user.id,
          oldName: dbUser.name,
          newName: profileUsername,
        });
      }

      const pictureValue: unknown = providerRow?.pictureClaim
        ? profile[providerRow.pictureClaim as keyof typeof profile]
        : profile.picture;
      if (typeof pictureValue === "string" && dbUser.image !== pictureValue && !dbUser.image?.startsWith("data:")) {
        await db.update(users).set({ image: pictureValue }).where(eq(users.id, user.id));
        logger.info("Profile picture for user of oidc provider has changed.", {
          userId: user.id,
        });
      }
    }

    logger.info("User logged in", { userId: user.id, userName: dbUser.name, timestamp: dayjs().format() });

    // We use a cookie as localStorage is not shared with server (otherwise flickering would occur)
    (await cookies()).set(colorSchemeCookieKey, dbUser.colorScheme, {
      path: "/",
      expires: dayjs().add(1, "year").toDate(),
    });
  };
};

const addUserToEveryoneGroupIfNotMemberAsync = async (db: Database, userId: string) => {
  const dbEveryoneGroup = await db.query.groups.findFirst({
    where: eq(groups.name, everyoneGroup),
    with: {
      members: {
        where: eq(groupMembers.userId, userId),
      },
    },
  });

  if (dbEveryoneGroup?.members.length === 0) {
    await db.insert(groupMembers).values({
      userId,
      groupId: dbEveryoneGroup.id,
    });
    logger.info("Added user to everyone group.", { userId });
  }
};

/**
 * One-time safe backfill of `groups.externalAuthentikGroupId` for local groups
 * that predate the group_ids rollout, by an EXACT name match against the
 * names/ids Authentik just presented on this token. Only ever fills a NULL
 * id; never overwrites or clears an existing one, and never touches group
 * membership. Logs every match and every unmatched local group so a rename
 * mismatch is visible instead of silently leaving a group unlinked.
 */
const backfillExternalAuthentikGroupIdsByNameAsync = async (
  db: Database,
  externalGroupIds: string[],
  externalGroupNames: string[],
) => {
  if (externalGroupIds.length !== externalGroupNames.length) {
    logger.info("group_ids and groups claims had mismatched lengths; skipping name-to-id backfill this sign-in.", {
      groupIdsCount: externalGroupIds.length,
      groupNamesCount: externalGroupNames.length,
    });
    return;
  }

  const unlinkedGroups = await db.query.groups.findMany({
    columns: { id: true, name: true },
    where: isNull(groups.externalAuthentikGroupId),
  });
  if (unlinkedGroups.length === 0) return;

  // Build name -> id, but track names that appear more than once in the
  // token's claims (e.g. two distinct Authentik groups sharing a display
  // name). An exact-name match against an ambiguous name cannot be trusted
  // to mean the RIGHT Authentik group, so such names are excluded from the
  // map entirely rather than silently resolving to whichever entry happened
  // to appear last.
  const idsByName = new Map<string, string[]>();
  externalGroupNames.forEach((name, index) => {
    const id = externalGroupIds[index];
    if (id === undefined) return;
    const existing = idsByName.get(name);
    if (existing) {
      existing.push(id);
    } else {
      idsByName.set(name, [id]);
    }
  });

  for (const localGroup of unlinkedGroups) {
    const candidateIds = idsByName.get(localGroup.name);
    if (!candidateIds) {
      logger.debug("No exact Authentik group name match for local group during backfill.", {
        groupId: localGroup.id,
        groupName: localGroup.name,
      });
      continue;
    }
    const distinctCandidateIds = [...new Set(candidateIds)];
    if (distinctCandidateIds.length > 1) {
      logger.info(
        "Skipping backfill for local group: multiple distinct Authentik groups share its name, so an exact name match cannot be trusted (fail closed - link it manually).",
        {
          groupId: localGroup.id,
          groupName: localGroup.name,
          ambiguousExternalIds: distinctCandidateIds,
        },
      );
      continue;
    }
    const matchedId = distinctCandidateIds[0];
    if (!matchedId) {
      continue;
    }

    await db.update(groups).set({ externalAuthentikGroupId: matchedId }).where(eq(groups.id, localGroup.id));
    logger.info("Backfilled externalAuthentikGroupId for local group by exact name match.", {
      groupId: localGroup.id,
      groupName: localGroup.name,
      externalAuthentikGroupId: matchedId,
    });
  }
};

/**
 * Authentik group RBAC sync (authentik-broker-standard Rule 9): matches and
 * synchronizes local group membership by the STABLE Authentik group id
 * (`groups.externalAuthentikGroupId`), never by group display name. Local
 * groups that have not yet been backfilled with an external id (see
 * `backfillExternalAuthentikGroupIdsByNameAsync`) are simply not matched by
 * this path; they are unaffected until backfilled.
 */
const synchronizeGroupsByExternalIdForUserAsync = async (db: Database, userId: string, externalGroupIds: string[]) => {
  const ignoredGroups = [everyoneGroup];
  const dbGroupMembers = await db.query.groupMembers.findMany({
    where: eq(groupMembers.userId, userId),
    with: {
      group: { columns: { name: true, externalAuthentikGroupId: true } },
    },
  });

  const missingExternalIdsForUser = externalGroupIds.filter(
    (externalId) => !dbGroupMembers.some(({ group }) => group.externalAuthentikGroupId === externalId),
  );

  if (missingExternalIdsForUser.length > 0) {
    logger.debug("Muninn does not have the user in certain groups (by external Authentik group id).", {
      user: userId,
      count: missingExternalIdsForUser.length,
    });

    const groupIds = await db.query.groups.findMany({
      columns: { id: true },
      where: inArray(groups.externalAuthentikGroupId, missingExternalIdsForUser),
    });

    logger.debug("Muninn has found groups in the database (by external Authentik group id) user is not in.", {
      user: userId,
      count: groupIds.length,
    });

    if (groupIds.length > 0) {
      await db.insert(groupMembers).values(
        groupIds.map((group) => ({
          userId,
          groupId: group.id,
        })),
      );

      logger.info("Added user to groups successfully (by external Authentik group id).", {
        user: userId,
        count: groupIds.length,
      });
    } else {
      logger.debug("User is already in all matchable groups of Muninn (by external Authentik group id).", {
        user: userId,
      });
    }
  }

  // Local groups with no stored external id (externalAuthentikGroupId === null)
  // are never candidates for id-based sync and are left untouched here, whether
  // the user is currently a member or not: this path only reconciles groups
  // that ARE linked to Authentik.
  const groupsUserIsNoLongerMemberOfExternally = dbGroupMembers.filter(
    ({ group }) =>
      group.externalAuthentikGroupId !== null &&
      !externalGroupIds.includes(group.externalAuthentikGroupId) &&
      !ignoredGroups.includes(group.name),
  );

  if (groupsUserIsNoLongerMemberOfExternally.length > 0) {
    logger.debug("Muninn has the user in certain Authentik-linked groups the token no longer lists.", {
      user: userId,
      count: groupsUserIsNoLongerMemberOfExternally.length,
    });

    await db.delete(groupMembers).where(
      and(
        eq(groupMembers.userId, userId),
        inArray(
          groupMembers.groupId,
          groupsUserIsNoLongerMemberOfExternally.map(({ groupId }) => groupId),
        ),
      ),
    );

    logger.info("Removed user from Authentik-linked groups no longer present in group_ids.", {
      user: userId,
      count: groupsUserIsNoLongerMemberOfExternally.length,
    });
  }
};

const synchronizeGroupsWithExternalForUserAsync = async (db: Database, userId: string, externalGroups: string[]) => {
  const ignoredGroups = [everyoneGroup];
  const dbGroupMembers = await db.query.groupMembers.findMany({
    where: eq(groupMembers.userId, userId),
    with: {
      group: { columns: { name: true } },
    },
  });

  /**
   * The below groups are those groups the user is part of in the external system, but not in Homarr.
   * So he has to be added to those groups.
   */
  const missingExternalGroupsForUser = externalGroups.filter(
    (externalGroup) => !dbGroupMembers.some(({ group }) => group.name === externalGroup),
  );

  if (missingExternalGroupsForUser.length > 0) {
    logger.debug("Muninn does not have the user in certain groups.", {
      user: userId,
      count: missingExternalGroupsForUser.length,
    });

    const groupIds = await db.query.groups.findMany({
      columns: {
        id: true,
      },
      where: inArray(groups.name, missingExternalGroupsForUser),
    });

    logger.debug("Muninn has found groups in the database user is not in.", {
      user: userId,
      count: groupIds.length,
    });

    if (groupIds.length > 0) {
      await db.insert(groupMembers).values(
        groupIds.map((group) => ({
          userId,
          groupId: group.id,
        })),
      );

      logger.info("Added user to groups successfully.", { user: userId, count: groupIds.length });
    } else {
      logger.debug("User is already in all groups of Muninn.", { user: userId });
    }
  }

  /**
   * The below groups are those groups the user is part of in Homarr, but not in the external system and not ignored.
   * So he has to be removed from those groups.
   */
  const groupsUserIsNoLongerMemberOfExternally = dbGroupMembers.filter(
    ({ group }) => !externalGroups.concat(ignoredGroups).includes(group.name),
  );

  if (groupsUserIsNoLongerMemberOfExternally.length > 0) {
    logger.debug("Muninn has the user in certain groups that LDAP does not have.", {
      user: userId,
      count: groupsUserIsNoLongerMemberOfExternally.length,
    });

    await db.delete(groupMembers).where(
      and(
        eq(groupMembers.userId, userId),
        inArray(
          groupMembers.groupId,
          groupsUserIsNoLongerMemberOfExternally.map(({ groupId }) => groupId),
        ),
      ),
    );

    logger.info("Removed user from groups successfully.", {
      user: userId,
      count: groupsUserIsNoLongerMemberOfExternally.length,
    });
  }
};
