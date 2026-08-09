/**
 * Next.js instrumentation hook: runs once at server startup before any request
 * is processed.
 *
 * Boot preflight (admin-hub-standard §7.4): validate required secrets so the
 * process fails fast with a clear error rather than silently degrading. The
 * check only runs inside the Node.js runtime (not Edge workers) because it
 * accesses process.env and crypto.
 */

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    // ---------------------------------------------------------------------------
    // §7.4 Boot preflight - fail fast on missing critical secrets
    // ---------------------------------------------------------------------------
    const isProduction = process.env.NODE_ENV === "production";

    // SECRET_ENCRYPTION_KEY must be a 64-character hex string (32 bytes).
    // It is used to derive the HMAC key for the audit chain (via HKDF) and to
    // seal integration secrets. An absent or malformed key means the audit log
    // runs without HMAC protection and integration secrets cannot be unsealed.
    const encKey = process.env.SECRET_ENCRYPTION_KEY;
    if (!encKey || encKey.trim().length === 0) {
      const msg =
        "[preflight] FATAL: SECRET_ENCRYPTION_KEY is not set. " +
        "The audit HMAC chain and integration-secret store require this key. " +
        "Generate a 32-byte hex value with: openssl rand -hex 32";
      if (isProduction) {
        // Hard-abort in production: running without this key is a security defect.
        console.error(msg);
        process.exit(1);
      } else {
        console.warn("[preflight] WARNING:", msg.replace("[preflight] FATAL: ", ""), "(dev - continuing with degraded audit HMAC)");
      }
    } else if (!/^[0-9a-fA-F]{64}$/.test(encKey)) {
      const msg =
        "[preflight] WARNING: SECRET_ENCRYPTION_KEY is set but does not look like a 64-character hex string. " +
        "Ensure you generated it with: openssl rand -hex 32";
      if (isProduction) {
        console.error("[preflight] FATAL:", msg.replace("[preflight] WARNING: ", ""));
        process.exit(1);
      } else {
        console.warn(msg);
      }
    }

    // ---------------------------------------------------------------------------
    // Scheduled tasks and WebSocket server (existing behaviour)
    // ---------------------------------------------------------------------------
    await import("@homarr/tasks");
    await import("@homarr/websocket");
  }
}
