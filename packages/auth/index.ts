import { headers } from "next/headers";
import type { DefaultSession } from "@auth/core/types";

import type { ColorScheme, GroupPermissionKey, SupportedAuthProvider } from "@homarr/definitions";

import { createConfiguration } from "./configuration";
import { loadOidcProvidersAsync } from "./providers/oidc/load-db-providers";

export type { Session } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      permissions: GroupPermissionKey[];
      colorScheme: ColorScheme;
    } & DefaultSession["user"];
  }
}

export * from "./security";

// See why it's unknown in the [...nextauth]/route.ts file
export const createHandlersAsync = async (provider: SupportedAuthProvider | "unknown", useSecureCookies: boolean) => {
  const requestHeaders = await headers();
  // Emkraan multi-OIDC (P4): load DB-configured providers per request (cached,
  // TTL-invalidated on admin CRUD) so add/edit/delete take effect without a restart.
  const oidcProviders = await loadOidcProvidersAsync(requestHeaders);
  return createConfiguration(provider, requestHeaders, useSecureCookies, oidcProviders);
};

export { getSessionFromTokenAsync as getSessionFromToken, sessionTokenCookieName } from "./session";
export {
  invalidateOidcProvidersCache,
  loadLoginProvidersAsync,
  type LoginProviderButton,
} from "./providers/oidc/load-db-providers";
