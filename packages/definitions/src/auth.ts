export const supportedAuthProviders = ["credentials", "oidc", "ldap"] as const;
export type SupportedAuthProvider = (typeof supportedAuthProviders)[number];

// Emkraan multi-OIDC (P4): the provider "type" of a DB-configured OIDC/OAuth2
// provider. All of these authenticate users with users.provider === "oidc"
// (they are disambiguated by the accounts table), so this does NOT widen
// SupportedAuthProvider. A type selects preset endpoints/scopes; "oidc" is a
// generic OIDC discovery provider and "oauth2" is fully-manual OAuth2.
export const oidcProviderTypes = [
  "oidc",
  "oauth2",
  "microsoft",
  "google",
  "github",
  "okta",
  "keycloak",
  "authentik",
] as const;
export type OidcProviderType = (typeof oidcProviderTypes)[number];
