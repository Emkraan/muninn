import { NextRequest } from "next/server";

import { createHandlersAsync } from "@homarr/auth";
import { createLogger } from "@homarr/core/infrastructure/logs";
import type { AuthProviderKey } from "@homarr/definitions";

const logger = createLogger({ module: "nextAuthRoute" });

export const GET = async (req: NextRequest) => {
  const { handlers } = await createHandlersAsync(extractProvider(req), isSecureCookieEnabled(req));

  return await handlers.GET(reqWithTrustedOrigin(req));
};
export const POST = async (req: NextRequest) => {
  const { handlers } = await createHandlersAsync(extractProvider(req), isSecureCookieEnabled(req));
  return await handlers.POST(reqWithTrustedOrigin(req));
};

/**
 * wheter to use secure cookies or not, is only supported for https.
 * For http it will not add the cookie as it is not considered secure.
 * @param req request containing the url
 * @returns true if the request is https, false otherwise
 */
const isSecureCookieEnabled = (req: NextRequest): boolean => {
  const url = new URL(req.url);
  return url.protocol === "https:";
};

/**
 * This method extracts the used provider from the url and allows us to override the getUserByEmail method in the adapter.
 * @param req request containing the url
 * @returns the provider or "unknown" if the provider could not be extracted
 */
const extractProvider = (req: NextRequest): AuthProviderKey | "unknown" => {
  const { pathname } = new URL(req.url);

  // NextAuth routes are /api/auth/(callback|signin)/<providerId>. Parse the
  // provider id exactly (not a substring match) so each DB OIDC provider keeps
  // its "oidc-<key>" identity - the adapter's getUserByEmail relies on this to
  // scope email lookups to a single IdP. Parsing the segment also hardens the
  // old substring bug (a callback URL query param containing "oidc" no longer
  // forces provider="oidc").
  const providerId = /\/api\/auth\/(?:callback|signin)\/([^/?#]+)/.exec(pathname)?.[1];
  if (providerId) {
    const decoded = decodeURIComponent(providerId);
    if (decoded === "credentials") return "credentials";
    if (decoded === "ldap") return "ldap";
    if (decoded === "oidc" || decoded.startsWith("oidc-")) return decoded as AuthProviderKey;
  }

  return "unknown";
};

/**
 * This is a workaround to allow the authentication to work with behind a proxy.
 * See https://github.com/nextauthjs/next-auth/issues/10928#issuecomment-2162893683
 */
const reqWithTrustedOrigin = (req: NextRequest): NextRequest => {
  const proto = req.headers.get("x-forwarded-proto");
  const host = req.headers.get("x-forwarded-host");
  if (!proto || !host) {
    logger.warn("Missing x-forwarded-proto or x-forwarded-host headers.");
    return req;
  }

  const envOrigin = `${proto}://${host}`;
  const { href, origin } = req.nextUrl;
  logger.debug(`Rewriting origin from ${origin} to ${envOrigin}`);
  return new NextRequest(href.replace(origin, envOrigin), req);
};
