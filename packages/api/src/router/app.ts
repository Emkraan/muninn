import { TRPCError } from "@trpc/server";
import { z } from "zod/v4";

import type { Session } from "@homarr/auth";
import { constructAppPermissions } from "@homarr/auth/shared";
import { createId } from "@homarr/common";
import type { Database, InferSelectModel } from "@homarr/db";
import { and, asc, eq, handleTransactionsAsync, inArray, likeInsensitive, sql } from "@homarr/db";
import { appGroupPermissions, apps, appUserPermissions, groupMembers, groupPermissions } from "@homarr/db/schema";
import { selectAppSchema } from "@homarr/db/validationSchemas";
import { defaultAppIconUrl, getPermissionsWithParents } from "@homarr/definitions";
import { getIconForName } from "@homarr/icons";
import { appCreateManySchema, appEditSchema, appManageSchema, appSavePermissionsSchema } from "@homarr/validation/app";
import { byIdSchema, paginatedSchema } from "@homarr/validation/common";

import { convertIntersectionToZodObject } from "../schema-merger";
import { createTRPCRouter, permissionRequiredProcedure, protectedProcedure, publicProcedure } from "../trpc";
import { throwIfActionForbiddenAsync } from "./app/app-access";
import { AppAccessControl } from "./app/app-access-control";

// App dedup identity = (normalized name, normalized href). Two apps are "the
// same" only when BOTH match; same name + different URL are distinct apps.
const normalizeAppName = (name: string) => name.trim().toLowerCase();
const normalizeAppHref = (href: string | null | undefined) => {
  const trimmed = (href ?? "").trim();
  if (trimmed === "") return "";
  try {
    const url = new URL(trimmed);
    url.protocol = url.protocol.toLowerCase();
    url.hostname = url.hostname.toLowerCase();
    url.hash = "";
    return url.toString().replace(/\/+$/, "");
  } catch {
    return trimmed.toLowerCase().replace(/\/+$/, "");
  }
};
const appIdentityKey = (name: string, href: string | null | undefined) =>
  `${normalizeAppName(name)}\u0000${normalizeAppHref(href)}`;

// Slug used in the admin disambiguation tag, e.g. owner "User A" + app "Google"
// -> "user_a_google".
const toTagSlug = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

// Global dedup: find ANY existing app with the same (name, href) identity,
// regardless of who owns it or whether the caller can see it, so identical
// bookmarks converge to one shared record instead of cluttering the backend.
const findAppByIdentityAsync = async (db: Database, name: string, href: string | null | undefined) => {
  const key = appIdentityKey(name, href);
  const candidates = await db.query.apps.findMany();
  return candidates.find((app) => appIdentityKey(app.name, app.href) === key) ?? null;
};

// Reference an existing shared app: grant the caller `use` (never `full`, so a
// referencing user cannot edit the shared record for everyone) unless they
// already hold some permission on it.
const referenceExistingAppAsync = async (db: Database, appId: string, userId: string) => {
  const existingGrant = await db.query.appUserPermissions.findFirst({
    where: and(eq(appUserPermissions.appId, appId), eq(appUserPermissions.userId, userId)),
  });
  if (!existingGrant) {
    await db.insert(appUserPermissions).values({ appId, userId, permission: "use" });
  }
};

export const appRouter = createTRPCRouter({
  getPaginated: protectedProcedure
    .input(paginatedSchema)
    .output(
      z.object({
        items: z.array(
          selectAppSchema.extend({
            // Per-app grants, so the management list can offer edit/delete to a
            // user who was granted this app directly rather than only to holders
            // of the global app-modify-all / app-full-all keys. app.update and
            // app.delete already accept both (see throwIfActionForbiddenAsync).
            permissions: z.object({
              hasUseAccess: z.boolean(),
              hasModifyAccess: z.boolean(),
              hasFullAccess: z.boolean(),
            }),
          }),
        ),
        totalCount: z.number(),
      }),
    )
    .meta({
      openapi: {
        method: "GET",
        path: "/api/apps/paginated",
        tags: ["apps"],
        protect: true,
      },
      mcp: {
        enabled: true,
        description:
          "List apps with pagination. OPTIONAL: search (string to filter by name), pageSize (number, default 10), page (number, default 1). All fields are optional: call with no arguments to get the first page",
      },
    })
    .query(async ({ input, ctx }) => {
      const scope = await new AppAccessControl(ctx.db, ctx.session?.user ?? null).getVisibleAppScopeAsync();
      if (scope !== "all" && scope.length === 0) return { items: [], totalCount: 0 };
      const scopeWhere = scope === "all" ? undefined : inArray(apps.id, scope);
      const searchWhere = input.search ? likeInsensitive(apps.name, input.search) : undefined;
      const whereQuery = and(scopeWhere, searchWhere);
      const totalCount = await ctx.db.$count(apps, whereQuery);

      const groupsOfCurrentUser = await ctx.db.query.groupMembers.findMany({
        where: eq(groupMembers.userId, ctx.session.user.id),
        columns: { groupId: true },
      });
      const groupIds = groupsOfCurrentUser.map((membership) => membership.groupId);

      const dbApps = await ctx.db.query.apps.findMany({
        limit: input.pageSize,
        offset: (input.page - 1) * input.pageSize,
        where: whereQuery,
        orderBy: asc(apps.name),
        with: {
          userPermissions: {
            where: eq(appUserPermissions.userId, ctx.session.user.id),
          },
          groupPermissions:
            groupIds.length > 0 ? { where: inArray(appGroupPermissions.groupId, groupIds) } : { where: sql`1 = 0` },
        },
      });

      return {
        items: dbApps.map(({ userPermissions, groupPermissions, ...app }) => ({
          ...app,
          permissions: constructAppPermissions({ userPermissions, groupPermissions }, ctx.session),
        })),
        totalCount,
      };
    }),
  all: protectedProcedure
    .input(z.void())
    .output(z.array(selectAppSchema))
    .meta({
      openapi: {
        method: "GET",
        path: "/api/apps",
        tags: ["apps"],
        protect: true,
      },
      mcp: { enabled: true, description: "List all apps" },
    })
    .query(async ({ ctx }) => {
      const scope = await new AppAccessControl(ctx.db, ctx.session?.user ?? null).getVisibleAppScopeAsync();
      if (scope !== "all" && scope.length === 0) return [];
      return ctx.db.query.apps.findMany({
        where: scope === "all" ? undefined : inArray(apps.id, scope),
        orderBy: asc(apps.name),
      });
    }),
  // Whether the caller may edit this app, by the same rule app.update applies:
  // the global app-modify-all key or a per-app modify/full grant. Lets the edit
  // page gate itself without duplicating the rule in the UI.
  canModify: protectedProcedure
    .input(byIdSchema)
    .output(z.boolean())
    .query(async ({ ctx, input }) => {
      return await throwIfActionForbiddenAsync(ctx, eq(apps.id, input.id), "modify").then(
        () => true,
        () => false,
      );
    }),
  // Cheap boolean for the navigation surfaces, so they can hide a link that
  // would only lead to an empty administration page.
  hasVisible: protectedProcedure.output(z.boolean()).query(async ({ ctx }) => {
    if (ctx.session.user.permissions.includes("app-create")) return true;
    const scope = await new AppAccessControl(ctx.db, ctx.session.user).getVisibleAppScopeAsync();
    return scope === "all" || scope.length > 0;
  }),
  search: protectedProcedure
    .input(
      z.object({
        query: z.string(),
        limit: z.number().min(1).max(100).default(10),
      }),
    )
    .output(z.array(selectAppSchema))
    .meta({
      openapi: {
        method: "GET",
        path: "/api/apps/search",
        tags: ["apps"],
        protect: true,
      },
      mcp: {
        enabled: true,
        description: "Search apps by name. REQUIRED: query (search string). OPTIONAL: limit (number, default 10)",
      },
    })
    .query(async ({ ctx, input }) => {
      const scope = await new AppAccessControl(ctx.db, ctx.session?.user ?? null).getVisibleAppScopeAsync();
      if (scope !== "all" && scope.length === 0) return [];
      return ctx.db.query.apps.findMany({
        where: and(likeInsensitive(apps.name, input.query), scope === "all" ? undefined : inArray(apps.id, scope)),
        orderBy: asc(apps.name),
        limit: input.limit,
      });
    }),
  selectable: protectedProcedure
    .input(z.void())
    .output(
      z.array(
        selectAppSchema.pick({
          id: true,
          name: true,
          iconUrl: true,
          href: true,
          pingUrl: true,
          description: true,
        }),
      ),
    )
    .meta({
      openapi: {
        method: "GET",
        path: "/api/apps/selectable",
        tags: ["apps"],
        protect: true,
      },
    })
    .query(async ({ ctx }) => {
      const scope = await new AppAccessControl(ctx.db, ctx.session?.user ?? null).getVisibleAppScopeAsync();
      if (scope !== "all" && scope.length === 0) return [];
      return ctx.db.query.apps.findMany({
        columns: {
          id: true,
          name: true,
          iconUrl: true,
          description: true,
          href: true,
          pingUrl: true,
        },
        where: scope === "all" ? undefined : inArray(apps.id, scope),
        orderBy: asc(apps.name),
      });
    }),
  byId: publicProcedure
    .input(byIdSchema)
    .output(selectAppSchema)
    .meta({
      openapi: {
        method: "GET",
        path: "/api/apps/{id}",
        tags: ["apps"],
        protect: true,
      },
      mcp: { enabled: true, description: "Get a single app by its ID. REQUIRED: id (app ID string)" },
    })
    .query(async ({ ctx, input }) => {
      const repository = new AppRepository(ctx.db, ctx.session?.user ?? null);
      const app = await repository.getByIdAsync(input.id);

      if (!app) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "App not found",
        });
      }

      return app;
    }),
  byIds: publicProcedure.input(z.array(z.string())).query(async ({ ctx, input }) => {
    const repository = new AppRepository(ctx.db, ctx.session?.user ?? null);
    return await repository.getByIdsAsync(input);
  }),
  // Admin-only: derive a `<owner>_<name>` disambiguation tag for every app
  // whose display name collides with another app's. The "owner" is the app's
  // `full`-permission holder (the creator, per the creator-grant on create;
  // with global dedup a shared app has exactly one full holder). Apps whose
  // name is unique are omitted (no tag needed - they show their plain name).
  getDuplicateTagMap: permissionRequiredProcedure
    .requiresPermission("app-modify-all")
    .output(z.record(z.string(), z.string()))
    .query(async ({ ctx }) => {
      const allApps = await ctx.db.query.apps.findMany({ columns: { id: true, name: true } });

      const appIdsByNormalizedName = new Map<string, string[]>();
      for (const app of allApps) {
        const key = normalizeAppName(app.name);
        const ids = appIdsByNormalizedName.get(key) ?? [];
        ids.push(app.id);
        appIdsByNormalizedName.set(key, ids);
      }
      const collidingIds = new Set([...appIdsByNormalizedName.values()].filter((ids) => ids.length > 1).flat());
      if (collidingIds.size === 0) return {};

      const fullHolders = await ctx.db.query.appUserPermissions.findMany({
        where: and(inArray(appUserPermissions.appId, [...collidingIds]), eq(appUserPermissions.permission, "full")),
        with: { user: { columns: { name: true } } },
      });
      const ownerNameByAppId = new Map<string, string>();
      for (const holder of fullHolders) {
        if (!ownerNameByAppId.has(holder.appId) && holder.user?.name) {
          ownerNameByAppId.set(holder.appId, holder.user.name);
        }
      }

      const tagMap: Record<string, string> = {};
      for (const app of allApps) {
        if (!collidingIds.has(app.id)) continue;
        const owner = ownerNameByAppId.get(app.id);
        // Fall back to the plain name when the owner can't be resolved (e.g. a
        // legacy app with no `full` holder), so the admin still sees something.
        tagMap[app.id] = owner ? `${toTagSlug(owner)}_${toTagSlug(app.name)}` : app.name;
      }
      return tagMap;
    }),
  create: permissionRequiredProcedure
    .requiresPermission("app-create")
    .input(appManageSchema)
    .output(z.object({ appId: z.string(), referencedExisting: z.boolean() }).and(selectAppSchema))
    .meta({
      openapi: {
        method: "POST",
        path: "/api/apps",
        tags: ["apps"],
        protect: true,
      },
      mcp: {
        enabled: true,
        description:
          "Create a new app (bookmark/shortcut to a service). REQUIRED: name (string), iconUrl (icon URL string), href (app URL, http/https or blank). OPTIONAL: description (string or null), pingUrl (URL to check reachability, or empty string). If an app with the same name AND URL already exists, no duplicate is created: you are granted access to the existing shared app and referencedExisting is true.",
      },
    })
    .mutation(async ({ ctx, input }) => {
      // Global dedup: an identical (same name + URL) app already exists ->
      // reference it instead of creating a duplicate. The caller gets `use` on
      // the existing shared record; nothing new is inserted.
      const existing = await findAppByIdentityAsync(ctx.db, input.name, input.href);
      if (existing) {
        await referenceExistingAppAsync(ctx.db, existing.id, ctx.session.user.id);
        return { appId: existing.id, referencedExisting: true, ...existing };
      }

      const id = createId();
      const insertValues = {
        id,
        name: input.name,
        description: input.description,
        iconUrl: input.iconUrl,
        href: input.href,
        pingUrl: input.pingUrl === "" ? null : input.pingUrl,
      };
      await ctx.db.insert(apps).values(insertValues);

      // Default stance: nothing is shared. The creator gets full control of the
      // app they made (super admins already hold app-full-all); no one else has
      // access until an admin grants it.
      await ctx.db.insert(appUserPermissions).values({
        appId: id,
        userId: ctx.session.user.id,
        permission: "full",
      });

      // TODO: breaking change necessary for removing appId property
      return { appId: id, referencedExisting: false, ...insertValues };
    }),
  createMany: permissionRequiredProcedure
    .requiresPermission("app-create")
    .input(appCreateManySchema)
    .output(z.void())
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      const rows: { id: string; name: string; description: string | null; iconUrl: string; href: string | null }[] = [];
      // Track identities created earlier in THIS batch so two identical rows in
      // one call also dedup to a single record.
      const createdInBatch = new Map<string, string>();

      for (const app of input) {
        const key = appIdentityKey(app.name, app.href);
        const batchId = createdInBatch.get(key);
        if (batchId) {
          await referenceExistingAppAsync(ctx.db, batchId, userId);
          continue;
        }
        const existing = await findAppByIdentityAsync(ctx.db, app.name, app.href);
        if (existing) {
          await referenceExistingAppAsync(ctx.db, existing.id, userId);
          continue;
        }
        const id = createId();
        rows.push({
          id,
          name: app.name,
          description: app.description,
          iconUrl: app.iconUrl ?? getIconForName(ctx.db, app.name).sync()?.url ?? defaultAppIconUrl,
          href: app.href,
        });
        createdInBatch.set(key, id);
      }

      if (rows.length > 0) {
        await ctx.db.insert(apps).values(rows);
        // Default stance: the creator gets full control of each app they made.
        await ctx.db
          .insert(appUserPermissions)
          .values(rows.map((row) => ({ appId: row.id, userId, permission: "full" as const })));
      }
    }),
  update: protectedProcedure
    .input(convertIntersectionToZodObject(appEditSchema))
    .output(z.void())
    .meta({
      openapi: {
        method: "PATCH",
        path: "/api/apps/{id}",
        tags: ["apps"],
        protect: true,
      },
      mcp: {
        enabled: true,
        description:
          "Update an existing app. REQUIRED: id (app ID), name, iconUrl, href. OPTIONAL: description (string or null), pingUrl (URL or empty string)",
      },
    })
    .mutation(async ({ ctx, input }) => {
      await throwIfActionForbiddenAsync(ctx, eq(apps.id, input.id), "modify");

      const app = await ctx.db.query.apps.findFirst({
        where: eq(apps.id, input.id),
      });

      if (!app) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "App not found",
        });
      }

      await ctx.db
        .update(apps)
        .set({
          name: input.name,
          description: input.description,
          iconUrl: input.iconUrl,
          href: input.href,
          pingUrl: input.pingUrl === "" ? null : input.pingUrl,
        })
        .where(eq(apps.id, input.id));
    }),
  delete: protectedProcedure
    .output(z.void())
    .meta({
      openapi: {
        method: "DELETE",
        path: "/api/apps/{id}",
        tags: ["apps"],
        protect: true,
      },
      mcp: { enabled: true, description: "Delete an app by ID. REQUIRED: id (app ID string)" },
    })
    .input(byIdSchema)
    .mutation(async ({ ctx, input }) => {
      await throwIfActionForbiddenAsync(ctx, eq(apps.id, input.id), "full");

      await ctx.db.delete(apps).where(eq(apps.id, input.id));
    }),
  getAppPermissions: protectedProcedure.input(byIdSchema).query(async ({ input, ctx }) => {
    await throwIfActionForbiddenAsync(ctx, eq(apps.id, input.id), "full");

    const dbGroupPermissions = await ctx.db.query.groupPermissions.findMany({
      where: inArray(
        groupPermissions.permission,
        getPermissionsWithParents(["app-use-all", "app-modify-all", "app-full-all"]),
      ),
      columns: {
        groupId: false,
      },
      with: {
        group: {
          columns: {
            id: true,
            name: true,
          },
        },
      },
    });

    const userPermissions = await ctx.db.query.appUserPermissions.findMany({
      where: eq(appUserPermissions.appId, input.id),
      with: {
        user: {
          columns: {
            id: true,
            name: true,
            image: true,
            email: true,
          },
        },
      },
    });

    const dbGroupAppPermission = await ctx.db.query.appGroupPermissions.findMany({
      where: eq(appGroupPermissions.appId, input.id),
      with: {
        group: {
          columns: {
            id: true,
            name: true,
          },
        },
      },
    });

    return {
      inherited: dbGroupPermissions.toSorted((permissionA, permissionB) => {
        return permissionA.group.name.localeCompare(permissionB.group.name);
      }),
      users: userPermissions
        .map(({ user, permission }) => ({
          user,
          permission,
        }))
        .toSorted((permissionA, permissionB) => {
          return (permissionA.user.name ?? "").localeCompare(permissionB.user.name ?? "");
        }),
      groups: dbGroupAppPermission
        .map(({ group, permission }) => ({
          group: {
            id: group.id,
            name: group.name,
          },
          permission,
        }))
        .toSorted((permissionA, permissionB) => {
          return permissionA.group.name.localeCompare(permissionB.group.name);
        }),
    };
  }),
  saveUserAppPermissions: protectedProcedure.input(appSavePermissionsSchema).mutation(async ({ input, ctx }) => {
    await throwIfActionForbiddenAsync(ctx, eq(apps.id, input.entityId), "full");

    await handleTransactionsAsync(ctx.db, {
      async handleAsync(db, schema) {
        await db.transaction(async (transaction) => {
          await transaction
            .delete(schema.appUserPermissions)
            .where(eq(schema.appUserPermissions.appId, input.entityId));
          if (input.permissions.length === 0) {
            return;
          }
          await transaction.insert(schema.appUserPermissions).values(
            input.permissions.map((permission) => ({
              userId: permission.principalId,
              permission: permission.permission,
              appId: input.entityId,
            })),
          );
        });
      },
      handleSync(db) {
        db.transaction((transaction) => {
          transaction.delete(appUserPermissions).where(eq(appUserPermissions.appId, input.entityId)).run();
          if (input.permissions.length === 0) {
            return;
          }
          transaction
            .insert(appUserPermissions)
            .values(
              input.permissions.map((permission) => ({
                userId: permission.principalId,
                permission: permission.permission,
                appId: input.entityId,
              })),
            )
            .run();
        });
      },
    });
  }),
  saveGroupAppPermissions: protectedProcedure.input(appSavePermissionsSchema).mutation(async ({ input, ctx }) => {
    await throwIfActionForbiddenAsync(ctx, eq(apps.id, input.entityId), "full");

    await handleTransactionsAsync(ctx.db, {
      async handleAsync(db, schema) {
        await db.transaction(async (transaction) => {
          await transaction
            .delete(schema.appGroupPermissions)
            .where(eq(schema.appGroupPermissions.appId, input.entityId));
          if (input.permissions.length === 0) {
            return;
          }
          await transaction.insert(schema.appGroupPermissions).values(
            input.permissions.map((permission) => ({
              groupId: permission.principalId,
              permission: permission.permission,
              appId: input.entityId,
            })),
          );
        });
      },
      handleSync(db) {
        db.transaction((transaction) => {
          transaction.delete(appGroupPermissions).where(eq(appGroupPermissions.appId, input.entityId)).run();
          if (input.permissions.length === 0) {
            return;
          }
          transaction
            .insert(appGroupPermissions)
            .values(
              input.permissions.map((permission) => ({
                groupId: permission.principalId,
                permission: permission.permission,
                appId: input.entityId,
              })),
            )
            .run();
        });
      },
    });
  }),
});

type App = InferSelectModel<typeof apps>;

export class AppRepository {
  private readonly accessControl: AppAccessControl;

  constructor(
    private db: Database,
    user: Session["user"] | null,
  ) {
    this.accessControl = new AppAccessControl(db, user);
  }

  public async getByIdAsync(id: string): Promise<App | null> {
    const apps = await this.getByIdsAsync([id]);
    return apps[0] ?? null;
  }

  public async getByIdsAsync(ids: string[]): Promise<App[]> {
    const canUserSeeApps = await this.accessControl.canUserSeeAppsAsync(ids);
    const dbApps = await this.db.query.apps.findMany({
      where: inArray(apps.id, ids),
    });

    return canUserSeeApps ? dbApps : [];
  }
}
