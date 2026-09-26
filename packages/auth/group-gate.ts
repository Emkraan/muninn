import { createLogger } from "@homarr/core/infrastructure/logs";
import type { Database } from "@homarr/db";

import { getOidcGroupConfigAsync } from "./providers/oidc/load-db-providers";

const logger = createLogger({ module: "authGroupGate" });

// NextAuth ids for DB OIDC providers are "oidc-<key>"; recover the key.
const oidcKeyFromProvider = (provider: string | undefined): string | null =>
  provider?.startsWith("oidc-") ? provider.slice("oidc-".length) : null;

const asStringArray = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : [];

/**
 * Multi-provider OIDC "allowed groups" sign-in gate. DB OIDC providers
 * dispatch as account.provider "oidc-<key>"; recover the key, load its
 * group config, and deny sign-in when allowedGroups is non-empty and the
 * caller is not a member of one of them. Providers that leave allowedGroups
 * empty are unaffected (CRITICAL: no gate configured => no gate, exactly as
 * before), as are credentials/ldap and non-oidc-prefixed providers.
 *
 * Authentik providers (authentik-broker-standard Rule 9): allowedGroups holds
 * stable Authentik group ids (the group_ids claim), never display names,
 * because a name can be renamed or reused. Fail closed: a token without a
 * non-empty group_ids claim grants no group roles and is denied outright
 * when the gate is configured.
 *
 * Migration compat: a provider's allowedGroups may still hold legacy group
 * NAMES set before this fix. Those are matched as a fallback against the
 * display-only groups claim so an operator who has not yet migrated every
 * entry to ids is not locked out; the fallback match is logged so the gap
 * stays visible until they switch.
 */
export const isOidcSignInAllowedAsync = async (
  db: Database,
  provider: string | undefined,
  profile: Record<string, unknown> | undefined,
  userId: string | undefined,
): Promise<boolean> => {
  const oidcKey = oidcKeyFromProvider(provider);
  if (!oidcKey) return true;

  const groupConfig = await getOidcGroupConfigAsync(db, oidcKey);
  if (!groupConfig || groupConfig.allowedGroups.length === 0) return true;

  if (groupConfig.providerType === "authentik") {
    const tokenGroupIds = asStringArray(profile?.group_ids);
    if (tokenGroupIds.length === 0) {
      logger.warn(
        "OIDC sign-in denied: Authentik token carried no (or an empty) group_ids claim (authentik-broker-standard Rule 9 fail-closed).",
        { provider, userId },
      );
      return false;
    }

    if (tokenGroupIds.some((id) => groupConfig.allowedGroups.includes(id))) {
      return true;
    }

    const userGroupNames = asStringArray(profile?.[groupConfig.groupsClaim]);
    if (userGroupNames.some((name) => groupConfig.allowedGroups.includes(name))) {
      logger.warn(
        "OIDC sign-in allowed by legacy group NAME in allowedGroups; migrate this provider's allowedGroups to Authentik group ids (authentik-broker-standard Rule 9).",
        { provider, userId },
      );
      return true;
    }

    logger.warn("OIDC sign-in denied: user is not a member of any allowed group.", { provider, userId });
    return false;
  }

  const userGroups = asStringArray(profile?.[groupConfig.groupsClaim]);
  const isAllowed = userGroups.some((group) => groupConfig.allowedGroups.includes(group));
  if (!isAllowed) {
    logger.warn("OIDC sign-in denied: user is not a member of any allowed group.", { provider, userId });
  }
  return isAllowed;
};
