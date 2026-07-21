export const supportedAuthProviders = ["credentials", "oidc", "ldap"] as const;
export type SupportedAuthProvider = (typeof supportedAuthProviders)[number];

// Multi-provider OIDC: the instance-level provider key stored in
// users.provider. credentials/ldap keep their class name; each DB OIDC provider
// namespaces to `oidc-<key>` (identical to its NextAuth id and accounts.provider)
// so distinct IdPs never collide in the adapter's getUserByEmail. This is a
// separate type from SupportedAuthProvider, which stays the closed class union
// used for AUTH_PROVIDERS parsing and enablement checks.
export type AuthProviderKey = SupportedAuthProvider | `oidc-${string}`;

// Multi-provider OIDC: the provider "type" of a DB-configured OIDC/OAuth2
// provider. A type selects preset endpoints/scopes; "oidc" is a generic OIDC
// discovery provider and "oauth2" is fully-manual OAuth2. Distinct from
// AuthProviderKey (the per-instance login identity) - many rows can share a
// providerType while each has its own key.
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
