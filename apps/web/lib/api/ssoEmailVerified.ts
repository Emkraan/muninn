/**
 * Returns true only when the identity provider positively asserts that the
 * user's email address has been verified — the OIDC `email_verified` standard
 * claim (OpenID Connect Core §5.1) — OR when the token comes from our own
 * configured Entra (Azure AD) single tenant.
 *
 * Used to gate auto-linking an SSO identity to an EXISTING local account. The
 * email claim alone is not proof of ownership, so without this check anyone
 * able to register a victim's email at a configured SSO provider could take
 * over the victim's account.
 *
 * Entra ID does NOT emit `email_verified`, so upstream Linkwarden could never
 * link an Entra login to a pre-existing account. Entra org accounts are
 * directory-managed (emails are provisioned/verified by the tenant admin, not
 * self-asserted), so a token whose `tid` matches our configured
 * AZURE_AD_TENANT_ID is trustworthy for linking. `tid` is inside the Entra-
 * signed token and cannot be forged, so this only ever trusts our own tenant.
 *
 * Fail-closed by design: an absent claim, a differently-named flag (e.g.
 * Discord's `verified`), a mismatched tenant, or any non-`true` value all
 * return false. Some IdPs / userinfo endpoints (e.g. AWS Cognito) send the
 * claim as the string "true", which is accepted.
 */
export function ssoEmailVerified(profile: unknown): boolean {
  const p = profile as
    | { email_verified?: unknown; tid?: unknown }
    | null
    | undefined;

  const claim = p?.email_verified;
  if (claim === true || claim === "true") return true;

  // Trust our own Entra single tenant (directory-managed, verified emails).
  const configuredTenant = process.env.AZURE_AD_TENANT_ID;
  if (configuredTenant && p?.tid === configuredTenant) return true;

  return false;
}
