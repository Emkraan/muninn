import { z } from "zod/v4";

import { invalidateOidcProvidersCache } from "@homarr/auth";
import { createId } from "@homarr/common";
import { encryptSecret } from "@homarr/common/server";
import { db, eq, ne } from "@homarr/db";
import { oidcProviders } from "@homarr/db/schema";
import { oidcProviderTypes } from "@homarr/definitions";

import { createTRPCRouter, permissionRequiredProcedure } from "../trpc";

// Sentinel returned to the client instead of the real secret, and accepted back
// on save to mean "leave the stored secret unchanged" (so it is never round-tripped).
const SECRET_SENTINEL = "__secret_unchanged__";

const upsertSchema = z.object({
  id: z.string().optional(),
  key: z
    .string()
    .min(1)
    // Max 59 so the derived login identity "oidc-<key>" (NextAuth id ==
    // accounts.provider == users.provider) always fits the varchar(64) columns.
    .max(59)
    .regex(/^[a-z0-9-]+$/, "Key must be a lowercase slug (a-z, 0-9, hyphen)"),
  displayName: z.string().min(1),
  providerType: z.enum(oidcProviderTypes),
  enabled: z.boolean().default(true),
  showOnLogin: z.boolean().default(true),
  isDefault: z.boolean().default(false),
  clientId: z.string().min(1),
  clientSecret: z.string().default(SECRET_SENTINEL),
  issuer: z.string().nullish(),
  discoveryUrl: z.string().nullish(),
  tenant: z.string().nullish(),
  authorizationUrl: z.string().nullish(),
  tokenUrl: z.string().nullish(),
  userinfoUrl: z.string().nullish(),
  scopes: z.string().nullish(),
  tokenEndpointAuthMethod: z.string().default("client_secret_basic"),
  allowDangerousEmailAccountLinking: z.boolean().default(false),
  forceUserinfo: z.boolean().default(false),
  nameClaim: z.string().nullish(),
  emailClaim: z.string().nullish(),
  pictureClaim: z.string().nullish(),
  usernameClaim: z.string().nullish(),
  groupsClaim: z.string().nullish(),
  allowedGroups: z.string().nullish(),
  adminGroups: z.string().nullish(),
  groupsLocalManagement: z.boolean().default(false),
});

// A default (auto sign-in) provider must be shown on the login page, otherwise
// loadLoginProvidersAsync filters it out and it becomes silently unreachable
// (no button, and the auto-login target is never found).
const upsertInputSchema = upsertSchema.refine((value) => !(value.isDefault && !value.showOnLogin), {
  message: "A default (auto sign-in) provider must also be shown on the login page.",
  path: ["isDefault"],
});

export const oidcProviderRouter = createTRPCRouter({
  // Admin list. Client secret is NEVER returned; a boolean flag + sentinel are.
  all: permissionRequiredProcedure.requiresPermission("admin").query(async () => {
    const rows = await db.query.oidcProviders.findMany();
    return rows.map(({ clientSecret, ...rest }) => ({
      ...rest,
      hasClientSecret: Boolean(clientSecret),
      clientSecret: SECRET_SENTINEL,
    }));
  }),

  upsert: permissionRequiredProcedure
    .requiresPermission("admin")
    .input(upsertInputSchema)
    .mutation(async ({ input }) => {
      const { id, clientSecret, ...fields } = input;

      // Only one provider may be the default.
      const clearOtherDefaults = async (keepId: string) => {
        if (input.isDefault) {
          await db.update(oidcProviders).set({ isDefault: false }).where(ne(oidcProviders.id, keepId));
        }
      };

      if (id) {
        const existing = await db.query.oidcProviders.findFirst({ where: eq(oidcProviders.id, id) });
        if (!existing) throw new Error("Provider not found");
        const nextSecret =
          clientSecret && clientSecret !== SECRET_SENTINEL ? encryptSecret(clientSecret) : existing.clientSecret;
        await db
          .update(oidcProviders)
          .set({ ...fields, clientSecret: nextSecret })
          .where(eq(oidcProviders.id, id));
        await clearOtherDefaults(id);
        invalidateOidcProvidersCache();
        return { id };
      }

      // Create: a real secret is required.
      if (!clientSecret || clientSecret === SECRET_SENTINEL) {
        throw new Error("A client secret is required when creating a provider");
      }
      const newId = createId();
      await db.insert(oidcProviders).values({
        ...fields,
        id: newId,
        clientSecret: encryptSecret(clientSecret),
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      await clearOtherDefaults(newId);
      invalidateOidcProvidersCache();
      return { id: newId };
    }),

  delete: permissionRequiredProcedure
    .requiresPermission("admin")
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input }) => {
      await db.delete(oidcProviders).where(eq(oidcProviders.id, input.id));
      invalidateOidcProvidersCache();
    }),
});
