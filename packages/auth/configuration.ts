import type { ReadonlyHeaders } from "next/dist/server/web/spec-extension/adapters/headers";
import { cookies } from "next/headers";
import type { OAuth2Config, OIDCConfig } from "@auth/core/providers";
import type { Profile } from "@auth/core/types";
import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";

import { createLogger } from "@homarr/core/infrastructure/logs";
import { db } from "@homarr/db";
import type { AuthProviderKey } from "@homarr/definitions";

import { createAdapter } from "./adapter";
import { createSessionCallback } from "./callbacks";
import { env } from "./env";
import { createSignInEventHandler } from "./events";
import { createCredentialsConfiguration, createLdapConfiguration } from "./providers/credentials/credentials-provider";
import { EmptyNextAuthProvider } from "./providers/empty/empty-provider";
import { filterProviders } from "./providers/filter-providers";
import { getOidcGroupConfigAsync } from "./providers/oidc/load-db-providers";
import { createRedirectUri } from "./redirect";
import { expireDateAfter, generateSessionToken, sessionTokenCookieName } from "./session";

const logger = createLogger({ module: "authConfiguration" });

// All Auth.js cookies are prefixed with AUTH_COOKIE_PREFIX (default "muninn") so
// Muninn's cookie jar is isolated from any other Auth.js/NextAuth app on the
// same hostname (browsers scope cookies by host, not by port).
// See https://github.com/homarr-labs/homarr/issues/5773
const createCookies = (useSecureCookies: boolean) => {
  const prefix = env.AUTH_COOKIE_PREFIX;
  const securePrefix = useSecureCookies ? "__Secure-" : "";
  const hostPrefix = useSecureCookies ? "__Host-" : "";
  return {
    sessionToken: { name: sessionTokenCookieName },
    csrfToken: { name: `${hostPrefix}${prefix}.csrf-token` },
    callbackUrl: { name: `${securePrefix}${prefix}.callback-url` },
    pkceCodeVerifier: { name: `${securePrefix}${prefix}.pkce.cooldown` },
    state: { name: `${securePrefix}${prefix}.state` },
    nonce: { name: `${securePrefix}${prefix}.nonce` },
  };
};

// See why it's unknown in the [...nextauth]/route.ts file
export const createConfiguration = (
  provider: AuthProviderKey | "unknown",
  headers: ReadonlyHeaders | null,
  useSecureCookies: boolean,
  // Multi-provider OIDC: DB-built OIDC/OAuth2 providers, injected by
  // createHandlersAsync. Already gated by `enabled` in the DB, so they bypass
  // the env-driven filterProviders (which only gates credentials/ldap).
  oidcProviders: (OIDCConfig<Profile> | OAuth2Config<Profile>)[] = [],
) => {
  const adapter = createAdapter(db, provider);
  return NextAuth({
    logger: {
      error: (error) => {
        // Remove the big error message for failed login attempts
        // as it is not useful for the user.
        if (error.name === "CredentialsSignin") {
          logger.warn("The login attempt of a user was not successful.");
          return;
        }

        logger.error(error);
      },
    },
    trustHost: true,
    cookies: createCookies(useSecureCookies),
    adapter,
    providers: [
      ...filterProviders([
        Credentials(createCredentialsConfiguration(db)),
        Credentials(createLdapConfiguration(db)),
        EmptyNextAuthProvider(),
      ]),
      ...oidcProviders,
    ],
    callbacks: {
      session: createSessionCallback(db),
      // eslint-disable-next-line no-restricted-syntax
      signIn: async ({ user, account, profile }) => {
        // Multi-provider OIDC: enforce the per-provider "allowed groups"
        // gate. DB OIDC providers dispatch as account.provider "oidc-<key>";
        // recover the key, load its group config, and deny sign-in when
        // allowedGroups is non-empty and the profile's groups claim does not
        // intersect it. Fail closed: a missing/empty/non-array claim => deny.
        // This is the only hook that can deny (the signIn EVENT runs after auth
        // and cannot block). Providers that leave allowedGroups empty are
        // unaffected, as are credentials/ldap.
        if (account?.provider.startsWith("oidc-")) {
          const oidcKey = account.provider.slice("oidc-".length);
          const groupConfig = await getOidcGroupConfigAsync(db, oidcKey);
          if (groupConfig && groupConfig.allowedGroups.length > 0) {
            const claimValue = profile?.[groupConfig.groupsClaim];
            const userGroups = Array.isArray(claimValue)
              ? claimValue.filter((group): group is string => typeof group === "string")
              : [];
            const isAllowed = userGroups.some((group) => groupConfig.allowedGroups.includes(group));
            if (!isAllowed) {
              logger.warn("OIDC sign-in denied: user is not a member of any allowed group.", {
                provider: account.provider,
                userId: user.id,
              });
              return false;
            }
          }
        }

        /**
         * For credentials provider only jwt is supported by default
         * so we have to create the session and set the cookie manually.
         */
        if (provider !== "credentials" && provider !== "ldap") {
          return true;
        }

        if (!adapter.createSession || !user.id) {
          return false;
        }

        const expires = expireDateAfter(env.AUTH_SESSION_EXPIRY_TIME);
        const sessionToken = generateSessionToken();
        await adapter.createSession({
          sessionToken,
          expires,
          userId: user.id,
        });

        (await cookies()).set(sessionTokenCookieName, sessionToken, {
          path: "/",
          expires: expires,
          httpOnly: true,
          sameSite: "lax",
          secure: useSecureCookies,
        });

        return true;
      },
    },
    events: {
      signIn: createSignInEventHandler(db),
    },
    redirectProxyUrl: createRedirectUri(headers, "/api/auth"),
    session: {
      strategy: "database",
      maxAge: env.AUTH_SESSION_EXPIRY_TIME,
      generateSessionToken,
    },
    pages: {
      signIn: "/auth/login",
      error: "/auth/login",
    },
    jwt: {
      // eslint-disable-next-line no-restricted-syntax
      async encode() {
        const cookie = (await cookies()).get(sessionTokenCookieName)?.value;
        return cookie ?? "";
      },

      decode() {
        return null;
      },
    },
  });
};
