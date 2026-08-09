/**
 * Next.js middleware for Muninn.
 *
 * Responsibilities:
 * 1. Inject a per-request X-Request-Id header for audit correlation. The id is
 *    a compact 16-hex-char random string safe to expose to clients.
 * 2. Compose the next-intl i18n middleware for locale-prefixed page routes.
 * 3. Apply a lightweight per-IP sliding-window rate limit on /api routes
 *    (default 200 req / 60 s, env-tunable via RATE_LIMIT_MAX / RATE_LIMIT_WINDOW_MS).
 *
 * Note: Traefik/Pangolin at the ingress also applies rate limiting and security
 * headers (HSTS, CSP additions). This middleware provides a defense-in-depth
 * second layer that works in local dev and integration tests that bypass the proxy.
 *
 * Edge-runtime note: Next.js middleware runs in the Edge Runtime. The in-memory
 * rate-limit store lives on globalThis so it survives across requests within one
 * worker instance, but is NOT shared across multiple replicas. For the homelab
 * single-container deployment this is sufficient (admin-hub-standard.md §12).
 */

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { createI18nMiddleware } from "@homarr/translation/middleware";

// The translation package's fallback locale. Hardcoded here because importing
// @homarr/translation in the Edge Runtime may pull transitive Node.js-only
// dependencies (mantine-react-table locale files). The value is stable: "en".
const DEFAULT_LOCALE = "en" as const;

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
// Rate limiting (sliding window, in-memory)
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

/** Returns true when the IP has exceeded the sliding window allowance. */
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
// i18n middleware (page routes only)
// ---------------------------------------------------------------------------

const i18nMiddleware = createI18nMiddleware(DEFAULT_LOCALE);

// ---------------------------------------------------------------------------
// Main middleware
// ---------------------------------------------------------------------------

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const requestId = generateRequestId();

  // Rate-limit + request-id for /api routes.
  if (pathname.startsWith("/api/")) {
    // Prefer the real client IP from X-Forwarded-For (one hop trusted: the
    // Pangolin/Traefik TLS terminator is the single proxy in front).
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

    // Pass through with the request-id attached so tRPC context and API routes
    // can read it for audit log correlation.
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

  // i18n for locale-prefixed page routes.
  const i18nResponse = i18nMiddleware(request);
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
  matcher: ["/((?!_next/static|_next/image|favicon\\.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
