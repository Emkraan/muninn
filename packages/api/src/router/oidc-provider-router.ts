import { lookup } from "node:dns/promises";
import net from "node:net";
import { z } from "zod/v4";

import { invalidateOidcProvidersCache } from "@homarr/auth";
import { createId } from "@homarr/common";
import { encryptSecret } from "@homarr/common/server";
import { fetchWithTrustedCertificatesAsync } from "@homarr/core/infrastructure/http";
import { db, eq, ne } from "@homarr/db";
import { oidcProviders } from "@homarr/db/schema";
import { oidcProviderTypes } from "@homarr/definitions";

import { writeAuditEntry } from "../audit";
import { createTRPCRouter, permissionRequiredProcedure } from "../trpc";

// Sentinel returned to the client instead of the real secret, and accepted back
// on save to mean "leave the stored secret unchanged" (so it is never round-tripped).
const SECRET_SENTINEL = "__secret_unchanged__";

// Verify (test-connection) probes the provider's discovery document; keep it
// short so a wedged IdP endpoint never hangs the admin UI.
const VERIFY_TIMEOUT_MS = 5000;

const trimTrailingSlash = (value: string) => value.replace(/\/+$/, "");

// SSRF guard for the admin verify probe. Self-hosted IdPs legitimately live on
// private LAN addresses (the real sign-in flow reaches them via
// fetchWithTrustedCertificatesAsync), so private ranges are intentionally NOT
// blocked. What is blocked are the addresses that are never a real IdP and are
// the high-value SSRF targets: loopback and link-local (incl. the cloud
// metadata endpoint 169.254.169.254) plus the unspecified address.
const isBlockedProbeAddress = (address: string): boolean => {
  const normalized = address.toLowerCase();
  const v4 = normalized.startsWith("::ffff:") ? normalized.slice(7) : normalized;
  if (net.isIPv4(v4)) {
    return v4.startsWith("127.") || v4.startsWith("169.254.") || v4 === "0.0.0.0";
  }
  if (normalized === "::1" || normalized === "::") return true;
  // fe80::/10 (link-local): first hextet 0xfe80-0xfebf.
  return /^fe[89ab]/.test(normalized);
};

// Validate a discovery URL before probing: only http(s), and its host must not
// resolve to a loopback/link-local/unspecified address. Returns an error
// message on rejection, or null when the URL is safe to fetch.
const validateDiscoveryUrlSafetyAsync = async (rawUrl: string): Promise<string | null> => {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return "Discovery URL is not a valid URL.";
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return `Unsupported URL scheme "${parsed.protocol}". Only http and https are allowed.`;
  }
  let addresses: { address: string }[];
  try {
    addresses = await lookup(parsed.hostname, { all: true });
  } catch {
    return `Could not resolve discovery host "${parsed.hostname}".`;
  }
  if (addresses.length === 0 || addresses.some(({ address }) => isBlockedProbeAddress(address))) {
    return "Discovery host resolves to a loopback or link-local address, which is not allowed.";
  }
  return null;
};

// Resolve the effective OIDC discovery URL for a stored provider, mirroring the
// preset derivation in @homarr/auth. Returns null when the type has no discovery
// document to probe (github / manual oauth2) or lacks the inputs to derive one.
const resolveDiscoveryUrl = (provider: {
  providerType: (typeof oidcProviderTypes)[number];
  discoveryUrl?: string | null;
  issuer?: string | null;
  tenant?: string | null;
}): string | null => {
  const explicit = provider.discoveryUrl?.trim();
  if (explicit) return explicit;

  switch (provider.providerType) {
    case "microsoft":
      return `https://login.microsoftonline.com/${provider.tenant?.trim() || "common"}/v2.0/.well-known/openid-configuration`;
    case "google":
      return "https://accounts.google.com/.well-known/openid-configuration";
    case "okta":
    case "keycloak":
    case "authentik":
    case "oidc": {
      const issuer = provider.issuer?.trim();
      return issuer ? `${trimTrailingSlash(issuer)}/.well-known/openid-configuration` : null;
    }
    // github has no discovery document; oauth2 uses manual endpoints.
    default:
      return null;
  }
};

interface VerifyResult {
  ok: boolean;
  message: string;
  checks: { name: string; ok: boolean }[];
}

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
  all: permissionRequiredProcedure.requiresPermission("other-manage-authentication").query(async () => {
    const rows = await db.query.oidcProviders.findMany();
    return rows.map(({ clientSecret, ...rest }) => ({
      ...rest,
      hasClientSecret: Boolean(clientSecret),
      clientSecret: SECRET_SENTINEL,
    }));
  }),

  upsert: permissionRequiredProcedure
    .requiresPermission("other-manage-authentication")
    .input(upsertInputSchema)
    .mutation(async ({ ctx, input }) => {
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
        await writeAuditEntry(db, {
          userId: ctx.session.user.id,
          userEmail: ctx.session.user.email ?? "",
          action: "oidcProvider.upsert",
          targetId: id,
          detail: { op: "update", displayName: fields.displayName },
          resourceType: "oidcProvider",
          resourceId: id,
        });
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
      await writeAuditEntry(db, {
        userId: ctx.session.user.id,
        userEmail: ctx.session.user.email ?? "",
        action: "oidcProvider.upsert",
        targetId: newId,
        detail: { op: "create", displayName: fields.displayName },
        resourceType: "oidcProvider",
        resourceId: newId,
      });
      return { id: newId };
    }),

  delete: permissionRequiredProcedure
    .requiresPermission("other-manage-authentication")
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await db.delete(oidcProviders).where(eq(oidcProviders.id, input.id));
      invalidateOidcProvidersCache();
      await writeAuditEntry(db, {
        userId: ctx.session.user.id,
        userEmail: ctx.session.user.email ?? "",
        action: "oidcProvider.delete",
        targetId: input.id,
        resourceType: "oidcProvider",
        resourceId: input.id,
      });
    }),

  // Test-connection: sanity-check a stored provider without signing anyone in.
  // Confirms credentials are present, resolves the effective discovery URL, and
  // probes it for the token/authorization endpoints. Never throws on a network
  // failure - it returns ok:false with a human-readable message instead.
  verify: permissionRequiredProcedure
    .requiresPermission("other-manage-authentication")
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input }): Promise<VerifyResult> => {
      const checks: { name: string; ok: boolean }[] = [];

      const provider = await db.query.oidcProviders.findFirst({ where: eq(oidcProviders.id, input.id) });
      if (!provider) {
        return { ok: false, message: "Provider not found.", checks };
      }

      const hasClientId = Boolean(provider.clientId.trim());
      checks.push({ name: "Client ID set", ok: hasClientId });
      const hasClientSecret = Boolean(provider.clientSecret);
      checks.push({ name: "Client secret set", ok: hasClientSecret });
      if (!hasClientId || !hasClientSecret) {
        return { ok: false, message: "Client ID and client secret are both required.", checks };
      }

      // GitHub exposes no discovery document; a complete credential pair is all we can check.
      if (provider.providerType === "github") {
        return { ok: true, message: "Credentials are complete. GitHub has no discovery document to probe.", checks };
      }

      const discoveryUrl = resolveDiscoveryUrl(provider);
      if (!discoveryUrl) {
        // Manual OAuth2 relies on the explicit token endpoint instead of discovery.
        if (provider.providerType === "oauth2") {
          const hasTokenUrl = Boolean(provider.tokenUrl?.trim());
          checks.push({ name: "Token URL set", ok: hasTokenUrl });
          return hasTokenUrl
            ? { ok: true, message: "Manual endpoints are configured. No discovery document to probe.", checks }
            : { ok: false, message: "Set a token URL (or a discovery URL) for this manual OAuth2 provider.", checks };
        }
        checks.push({ name: "Discovery URL resolved", ok: false });
        return { ok: false, message: "Could not resolve a discovery URL. Set an issuer or discovery URL.", checks };
      }
      checks.push({ name: "Discovery URL resolved", ok: true });

      const unsafeReason = await validateDiscoveryUrlSafetyAsync(discoveryUrl);
      if (unsafeReason) {
        checks.push({ name: "Discovery URL is safe to probe", ok: false });
        return { ok: false, message: unsafeReason, checks };
      }
      checks.push({ name: "Discovery URL is safe to probe", ok: true });

      try {
        // Mirror the real sign-in flow's fetch (trusted certs for self-signed
        // homelab IdPs); redirect: "manual" so a 3xx can't bounce the probe into
        // an internal address after the pre-flight host check.
        const response = await fetchWithTrustedCertificatesAsync(discoveryUrl, {
          redirect: "manual",
          timeout: VERIFY_TIMEOUT_MS,
        });
        if (!response.ok) {
          checks.push({ name: "Discovery document reachable", ok: false });
          return {
            ok: false,
            message: `Discovery endpoint returned HTTP ${response.status} ${response.statusText}.`,
            checks,
          };
        }
        checks.push({ name: "Discovery document reachable", ok: true });

        const document = (await response.json()) as {
          token_endpoint?: unknown;
          authorization_endpoint?: unknown;
        };
        const hasToken = typeof document.token_endpoint === "string" && document.token_endpoint.length > 0;
        const hasAuthorization =
          typeof document.authorization_endpoint === "string" && document.authorization_endpoint.length > 0;
        checks.push({ name: "token_endpoint present", ok: hasToken });
        checks.push({ name: "authorization_endpoint present", ok: hasAuthorization });

        if (!hasToken || !hasAuthorization) {
          return { ok: false, message: "Discovery document is missing a token or authorization endpoint.", checks };
        }
        return { ok: true, message: "Provider configuration verified. The discovery document looks valid.", checks };
      } catch (error) {
        checks.push({ name: "Discovery document reachable", ok: false });
        const timedOut = error instanceof Error && (error.name === "AbortError" || error.name === "TimeoutError");
        const reason = timedOut ? `timed out after ${VERIFY_TIMEOUT_MS / 1000}s` : "could not be reached";
        const detail = !timedOut && error instanceof Error ? `: ${error.message}` : "";
        return { ok: false, message: `Discovery endpoint ${reason}${detail}.`, checks };
      }
    }),
});
