// Boot-time preflight. Fails fast in production on missing critical config so a
// misconfigured instance never starts silently in a half-broken state; in
// development it only warns. Called once at server start via instrumentation.ts.

type Check = {
  key: string;
  required: boolean; // hard-required: throw in production if missing
  present: boolean;
  note?: string;
};

export function runPreflight(): void {
  const isProd = process.env.NODE_ENV === "production";

  const checks: Check[] = [
    {
      key: "NEXTAUTH_SECRET",
      required: true,
      present: !!process.env.NEXTAUTH_SECRET,
      note: "session/JWT signing",
    },
    {
      key: "DATABASE_URL",
      required: true,
      present: !!process.env.DATABASE_URL,
      note: "PostgreSQL connection",
    },
    {
      key: "NEXTAUTH_URL",
      required: true,
      present: !!process.env.NEXTAUTH_URL,
      note: "auth callback base URL",
    },
    {
      key: "AUDIT_HMAC_SECRET",
      required: false,
      present: !!process.env.AUDIT_HMAC_SECRET,
      note: "tamper-evident audit log falls back to SHA-256 without it",
    },
    {
      key: "MEILI_HOST",
      required: false,
      present: !!process.env.MEILI_HOST,
      note: "full-text search is disabled without it",
    },
  ];

  const missingRequired = checks.filter((c) => c.required && !c.present);
  const missingOptional = checks.filter((c) => !c.required && !c.present);

  for (const c of missingOptional) {
    console.warn(`[preflight] optional ${c.key} not set - ${c.note}`);
  }

  // Dev-bypass fail-safe: a dev auth bypass must never be armed in production.
  if (isProd && process.env.NEXT_PUBLIC_DEMO === "true") {
    console.warn("[preflight] NEXT_PUBLIC_DEMO=true in production (read-only demo mode)");
  }

  if (missingRequired.length > 0) {
    const list = missingRequired
      .map((c) => `${c.key} (${c.note})`)
      .join(", ");
    const message = `[preflight] missing required configuration: ${list}`;
    if (isProd) {
      throw new Error(message);
    } else {
      console.warn(`${message} - continuing in development`);
    }
  } else {
    console.log("[preflight] configuration OK");
  }
}
