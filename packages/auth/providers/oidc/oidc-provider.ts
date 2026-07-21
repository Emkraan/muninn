import type { ReadonlyHeaders } from "next/dist/server/web/spec-extension/adapters/headers";
import type { OAuth2Config, OIDCConfig } from "@auth/core/providers";
import type { Profile } from "@auth/core/types";
import { customFetch } from "next-auth";

import { decryptSecret } from "@homarr/common/server";
import { fetchWithTrustedCertificatesAsync } from "@homarr/core/infrastructure/http";
import type { OidcProvider as OidcProviderRow } from "@homarr/db/schema";

import { env } from "../../env";
import { createRedirectUri } from "../../redirect";
import { resolveOidcConfig } from "./presets";

// Strip a www-authenticate header some IdPs (fusionauth/authelia) return on the
// token response, which otherwise breaks Auth.js. Shared by the env provider
// and every DB-built provider.
const conformTokenResponse = (response: Response) => {
  if (response.status === 401) return response;
  const newHeaders = Array.from(response.headers.entries())
    .filter(([key]) => key.toLowerCase() !== "www-authenticate")
    .reduce((headers, [key, value]) => {
      headers.append(key, value);
      return headers;
    }, new Headers());
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: newHeaders,
  });
};

export const extractProfileName = (profile: Profile) => {
  if (!env.AUTH_OIDC_NAME_ATTRIBUTE_OVERWRITE) {
    // Use the name as the username if the preferred_username is an email address
    return profile.preferred_username?.includes("@") ? profile.name : profile.preferred_username;
  }

  return profile[env.AUTH_OIDC_NAME_ATTRIBUTE_OVERWRITE as keyof typeof profile] as string;
};

// --- Emkraan multi-OIDC (P4): build a NextAuth provider from a DB row -------

export const buildProfileName = (row: OidcProviderRow, profile: Profile): string | undefined => {
  const claim = row.nameClaim ?? row.usernameClaim;
  if (claim) {
    const value = profile[claim as keyof Profile];
    return typeof value === "string" ? value : undefined;
  }
  const fallback = profile.preferred_username?.includes("@") ? profile.name : profile.preferred_username;
  return fallback ?? profile.name ?? undefined;
};

/**
 * Build one NextAuth provider from a stored oidcProvider row. Each provider gets
 * a distinct id `oidc-${key}` (so NextAuth dispatches /callback/oidc-${key}
 * natively) but authenticates users as provider "oidc" (collapse, not widen -
 * distinct IdPs are separated by the accounts table). Client secret is
 * decrypted from the stored ciphertext.
 */
export const buildOidcProviderFromDb = (
  row: OidcProviderRow,
  headers: ReadonlyHeaders | null,
): OIDCConfig<Profile> | OAuth2Config<Profile> => {
  const resolved = resolveOidcConfig(row);
  const id = `oidc-${row.key}`;
  const redirectUri = createRedirectUri(headers, `/api/auth/callback/${id}`, "https");
  const scope = resolved.scopes.join(" ");
  const clientSecret = decryptSecret(row.clientSecret);

  const mapProfile = (profile: Profile) => {
    if (!profile.sub) {
      throw new Error(`OIDC provider '${row.key}' did not return a sub`);
    }
    const name = buildProfileName(row, profile) ?? profile.email ?? profile.sub;
    const picture = row.pictureClaim ? (profile[row.pictureClaim as keyof Profile] as unknown) : profile.picture;
    const email = row.emailClaim ? (profile[row.emailClaim as keyof Profile] as string | undefined) : profile.email;
    return {
      id: profile.sub,
      name,
      email: email ?? null,
      image: typeof picture === "string" ? picture : null,
      // Namespace the stored users.provider per IdP ("oidc-<key>", identical to
      // this provider's NextAuth id + accounts.provider) so the adapter's
      // getUserByEmail scopes to one IdP and cannot collide across providers.
      provider: id,
    };
  };

  if (resolved.flow === "oauth2") {
    return {
      id,
      name: row.displayName,
      type: "oauth",
      clientId: row.clientId,
      clientSecret,
      authorization: { url: resolved.authorizationUrl, params: { scope, redirect_uri: redirectUri } },
      token: { url: resolved.tokenUrl ?? "", conform: conformTokenResponse },
      userinfo: resolved.userinfoUrl,
      allowDangerousEmailAccountLinking: row.allowDangerousEmailAccountLinking,
      profile: mapProfile,
      // @ts-expect-error `undici` has a `duplex` option
      [customFetch]: fetchWithTrustedCertificatesAsync,
    } satisfies OAuth2Config<Profile>;
  }

  return {
    id,
    name: row.displayName,
    type: "oidc",
    clientId: row.clientId,
    clientSecret,
    client: {
      token_endpoint_auth_method:
        row.tokenEndpointAuthMethod as (typeof env)["AUTH_OIDC_TOKEN_ENDPOINT_AUTH_METHOD"],
    },
    ...(resolved.discoveryUrl ? { wellKnown: resolved.discoveryUrl } : { issuer: resolved.issuer }),
    allowDangerousEmailAccountLinking: row.allowDangerousEmailAccountLinking,
    authorization: { params: { scope, redirect_uri: redirectUri } },
    token: { conform: conformTokenResponse },
    idToken: !row.forceUserinfo,
    profile: mapProfile,
    // @ts-expect-error `undici` has a `duplex` option
    [customFetch]: fetchWithTrustedCertificatesAsync,
  } satisfies OIDCConfig<Profile>;
};
