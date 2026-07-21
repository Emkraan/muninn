import type { OidcProviderType } from "@homarr/definitions";

// Emkraan multi-OIDC (P4): per-type presets, ported from snagarr's resolve().
// Presets only fill fields the admin left empty; admin-supplied values always
// win. "oidc" is generic OIDC discovery; "oauth2"/"github" are OAuth2 flows.

export interface ResolvedOidcConfig {
  flow: "oidc" | "oauth2";
  issuer?: string;
  discoveryUrl?: string;
  authorizationUrl?: string;
  tokenUrl?: string;
  userinfoUrl?: string;
  scopes: string[];
  usernameClaim?: string;
  groupsClaim?: string;
}

export interface PresetInput {
  providerType: OidcProviderType;
  issuer?: string | null;
  discoveryUrl?: string | null;
  tenant?: string | null;
  authorizationUrl?: string | null;
  tokenUrl?: string | null;
  userinfoUrl?: string | null;
  scopes?: string | null; // space-joined
  usernameClaim?: string | null;
  groupsClaim?: string | null;
}

const DEFAULT_OIDC_SCOPES = ["openid", "profile", "email"];

const isOauth2Flow = (type: OidcProviderType): boolean => type === "oauth2" || type === "github";

/**
 * Resolve a stored OIDC provider row into an effective config by layering the
 * type preset UNDER the admin's values (only filling blanks). Mirrors snagarr's
 * `resolve(cfg)`.
 */
export function resolveOidcConfig(input: PresetInput): ResolvedOidcConfig {
  const adminScopes = input.scopes?.trim() ? input.scopes.trim().split(/\s+/) : undefined;

  const resolved: ResolvedOidcConfig = {
    flow: isOauth2Flow(input.providerType) ? "oauth2" : "oidc",
    issuer: input.issuer ?? undefined,
    discoveryUrl: input.discoveryUrl ?? undefined,
    authorizationUrl: input.authorizationUrl ?? undefined,
    tokenUrl: input.tokenUrl ?? undefined,
    userinfoUrl: input.userinfoUrl ?? undefined,
    scopes: adminScopes ?? DEFAULT_OIDC_SCOPES,
    usernameClaim: input.usernameClaim ?? undefined,
    groupsClaim: input.groupsClaim ?? undefined,
  };

  switch (input.providerType) {
    case "microsoft":
      resolved.discoveryUrl ??= `https://login.microsoftonline.com/${input.tenant ?? "common"}/v2.0/.well-known/openid-configuration`;
      // User.Read makes the returned access token a Graph token (for the photo fetch).
      resolved.scopes = adminScopes ?? ["openid", "profile", "email", "User.Read"];
      resolved.usernameClaim ??= "preferred_username";
      resolved.groupsClaim ??= "groups";
      break;
    case "google":
      resolved.discoveryUrl ??= "https://accounts.google.com/.well-known/openid-configuration";
      break;
    case "github":
      resolved.authorizationUrl ??= "https://github.com/login/oauth/authorize";
      resolved.tokenUrl ??= "https://github.com/login/oauth/access_token";
      resolved.userinfoUrl ??= "https://api.github.com/user";
      resolved.scopes = adminScopes ?? ["read:user", "user:email"];
      break;
    case "okta":
    case "keycloak":
    case "authentik":
      // Issuer-based OIDC discovery; groups claim by convention.
      resolved.scopes = adminScopes ?? ["openid", "profile", "email", "groups"];
      resolved.groupsClaim ??= "groups";
      break;
    case "oidc":
    case "oauth2":
      // Generic: rely on the admin-supplied discoveryUrl / issuer / manual endpoints.
      break;
  }

  return resolved;
}
