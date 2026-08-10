import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { api } from "@homarr/api/server";
import { localeCookieKey } from "@homarr/definitions";
import type { SupportedLanguage } from "@homarr/translation";
import { supportedLanguages } from "@homarr/translation";
import { createI18nMiddleware } from "@homarr/translation/middleware";

let isOnboardingFinished = false;

// ---------------------------------------------------------------------------
// Request-ID generation (Edge-safe: uses crypto.getRandomValues, not Node crypto)
// ---------------------------------------------------------------------------

function generateRequestId(): string {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// ---------------------------------------------------------------------------
// Rate limiting (sliding window, in-memory — see admin-hub-standard §12)
// Single-replica homelab deployment: in-process store is sufficient.
// ---------------------------------------------------------------------------

interface RateLimitBucket {
  count: number;
  windowStart: number;
}

declare global {
  // eslint-disable-next-line no-var
  var __rateLimitStore: Map<string, RateLimitBucket> | undefined;
}

function getRateLimitStore(): Map<string, RateLimitBucket> {
  if (!globalThis.__rateLimitStore) {
    globalThis.__rateLimitStore = new Map<string, RateLimitBucket>();
  }
  return globalThis.__rateLimitStore;
}

const RATE_LIMIT_MAX = Number(process.env.RATE_LIMIT_MAX ?? 200);
const RATE_LIMIT_WINDOW_MS = Number(process.env.RATE_LIMIT_WINDOW_MS ?? 60_000);

function isRateLimited(ip: string): boolean {
  const store = getRateLimitStore();
  const now = Date.now();
  const bucket = store.get(ip);

  if (!bucket || now - bucket.windowStart > RATE_LIMIT_WINDOW_MS) {
    store.set(ip, { count: 1, windowStart: now });
    return false;
  }

  if (bucket.count >= RATE_LIMIT_MAX) {
    return true;
  }

  bucket.count += 1;
  return false;
}

// ---------------------------------------------------------------------------
// Proxy (Homarr middleware entry point — replaces Next.js middleware.ts)
// ---------------------------------------------------------------------------

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const requestId = generateRequestId();

  // Rate-limit + request-id for /api routes.
  if (pathname.startsWith("/api/")) {
    const forwarded = request.headers.get("x-forwarded-for");
    const ip = forwarded ? (forwarded.split(",")[0]?.trim() ?? "unknown") : "unknown";

    if (isRateLimited(ip)) {
      return new NextResponse(JSON.stringify({ error: "Too many requests" }), {
        status: 429,
        headers: {
          "Content-Type": "application/json",
          "X-Request-Id": requestId,
          "Retry-After": String(Math.ceil(RATE_LIMIT_WINDOW_MS / 1000)),
        },
      });
    }

    const response = NextResponse.next({
      request: {
        headers: new Headers({
          ...Object.fromEntries(request.headers.entries()),
          "x-request-id": requestId,
        }),
      },
    });
    response.headers.set("X-Request-Id", requestId);
    return response;
  }

  // Redirect to onboarding if it's not finished yet
  if (!isOnboardingFinished && !pathname.endsWith("/init")) {
    const currentOnboardingStep = await api.onboard.currentStep();
    if (currentOnboardingStep.current !== "finish") {
      return NextResponse.redirect(new URL("/init", request.url));
    }

    isOnboardingFinished = true;
  }

  // Only run this if the user has not already configured their language
  const currentLocale = request.cookies.get(localeCookieKey)?.value;
  let defaultLocale: SupportedLanguage = "en";
  if (!currentLocale || !supportedLanguages.includes(currentLocale as SupportedLanguage)) {
    defaultLocale = await api.serverSettings.getCulture().then((culture) => culture.defaultLocale);
  }

  // We don't want to fallback to accept-language header so we clear it
  request.headers.set("accept-language", "");

  const next = createI18nMiddleware(defaultLocale);
  const i18nResponse = next(request);
  if (i18nResponse) {
    i18nResponse.headers.set("X-Request-Id", requestId);
    return i18nResponse;
  }

  const response = NextResponse.next();
  response.headers.set("X-Request-Id", requestId);
  return response;
}

export const config = {
  // Run on every path except Next.js internals and static assets.
  // Expanded from the Homarr default to cover /api/ for rate limiting and
  // request-id injection (admin-hub-standard §12).
  matcher: ["/((?!_next/static|_next/image|favicon\\.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
