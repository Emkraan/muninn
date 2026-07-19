// tests/gates/lib.mjs
//
// Shared helpers for the Muninn ship-gate integration tests.
//
// These run against a LIVE Muninn instance over its REST API (deploy-time
// integration tests, not CI unit tests). Zero dependencies: Node 18+ ESM with
// the global `fetch` only.
//
// Every Muninn API response is JSON shaped `{ "response": <payload> }` and
// success is HTTP 200 (POST /api/v1/users is 201). The `api()`/`apiRaw()`
// helpers unwrap the envelope for you and tolerate the few endpoints that are
// not enveloped (e.g. GET /api/v1/health).

import { fileURLToPath } from "node:url";
import { realpathSync } from "node:fs";

// ---------------------------------------------------------------------------
// Configuration (from environment). See tests/gates/README.md.
// ---------------------------------------------------------------------------
export const config = {
  // MUNINN_URL has a sensible default so a local `node gateN.mjs` just works.
  url: (process.env.MUNINN_URL || "http://localhost:3000").replace(/\/+$/, ""),
  userA: process.env.USER_A_TOKEN || "",
  userB: process.env.USER_B_TOKEN || "",
  admin: process.env.ADMIN_TOKEN || "",
};

// Throw a helpful message if a required env var is missing.
export function requireEnv(names) {
  const missing = names.filter((n) => !process.env[n]);
  if (missing.length) {
    throw new Error(
      `Missing required env var(s): ${missing.join(
        ", "
      )}. See tests/gates/README.md`
    );
  }
}

// ---------------------------------------------------------------------------
// Colored logging (auto-disabled when not a TTY or when NO_COLOR is set).
// ---------------------------------------------------------------------------
const useColor = process.stdout.isTTY && !process.env.NO_COLOR;
const wrap = (code) => (s) => (useColor ? `\x1b[${code}m${s}\x1b[0m` : String(s));
export const c = {
  green: wrap(32),
  red: wrap(31),
  yellow: wrap(33),
  cyan: wrap(36),
  gray: wrap(90),
  bold: wrap(1),
};

// ---------------------------------------------------------------------------
// HTTP client
// ---------------------------------------------------------------------------
export class ApiError extends Error {
  constructor(status, message, body) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.body = body;
  }
}

// Low-level call: NEVER throws on an HTTP status, only on a network failure.
// Returns { ok, status, response, raw } where `response` is the unwrapped
// `.response` envelope when present, else the raw parsed body / text.
export async function apiRaw(method, path, { token, body, headers = {} } = {}) {
  const url = /^https?:\/\//.test(path)
    ? path
    : `${config.url}/api/v1${path}`;

  const opts = { method, headers: { Accept: "application/json", ...headers } };
  if (token) opts.headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) {
    opts.headers["Content-Type"] = "application/json";
    opts.body = JSON.stringify(body);
  }

  const res = await fetch(url, opts);
  const text = await res.text();
  let json;
  try {
    json = text ? JSON.parse(text) : undefined;
  } catch {
    json = undefined;
  }

  const response =
    json && Object.prototype.hasOwnProperty.call(json, "response")
      ? json.response
      : json ?? text;

  return { ok: res.ok, status: res.status, response, raw: json ?? text };
}

// Convenience wrapper: returns the unwrapped `.response` on 2xx, throws an
// ApiError carrying the server's message + status on any non-2xx.
export async function api(method, path, opts = {}) {
  const r = await apiRaw(method, path, opts);
  if (!r.ok) {
    const msg =
      typeof r.response === "string"
        ? r.response
        : (r.response && (r.response.message || JSON.stringify(r.response))) ||
          `HTTP ${r.status}`;
    throw new ApiError(r.status, msg, r.response);
  }
  return r.response;
}

// ---------------------------------------------------------------------------
// Assertions + reporter
// ---------------------------------------------------------------------------

// Hard assertion: throws on a falsy condition. Use for setup preconditions that
// must abort the gate (a thrown error is recorded as a gate failure).
export function assert(cond, msg) {
  if (!cond) throw new Error(msg || "Assertion failed");
}

// A per-gate pass/fail accumulator with colored output.
export function reporter(name) {
  let passed = 0;
  let failed = 0;
  const failures = [];
  const log = (...a) => console.log(...a);

  return {
    name,
    banner() {
      log(c.bold(c.cyan(`\n=== ${name} ===`)));
    },
    info(msg) {
      log(c.gray(`  .  ${msg}`));
    },
    pass(msg) {
      passed++;
      log(`  ${c.green("PASS")} ${msg}`);
    },
    fail(msg) {
      failed++;
      failures.push(msg);
      log(`  ${c.red("FAIL")} ${msg}`);
    },
    // Soft check: logs pass/fail, accumulates, returns the boolean.
    check(cond, msg) {
      if (cond) this.pass(msg);
      else this.fail(msg);
      return !!cond;
    },
    get passed() {
      return passed;
    },
    get failed() {
      return failed;
    },
    result(err) {
      return {
        name,
        passed,
        failed,
        ok: failed === 0 && !err,
        failures,
        error: err ? String(err.message || err) : null,
      };
    },
  };
}

// ---------------------------------------------------------------------------
// Small utilities
// ---------------------------------------------------------------------------
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Random lowercase [a-z0-9-] token, safe for usernames (/^[a-z0-9_-]{3,50}$/).
export function rand(prefix = "gate") {
  return `${prefix}-${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 8)}`;
}

export function isValidDate(s) {
  if (typeof s !== "string") return false;
  const t = Date.parse(s);
  return Number.isFinite(t);
}

// True when the given module is the file that was invoked directly with node.
export function isMain(metaUrl) {
  const self = fileURLToPath(metaUrl);
  const invoked = process.argv[1];
  if (!invoked) return false;
  try {
    return self === realpathSync(invoked);
  } catch {
    return self === invoked;
  }
}

// Print a single gate's result (used by standalone runs).
export function printResult(res) {
  const status = res.ok ? c.green("PASSED") : c.red("FAILED");
  console.log(
    `\n${c.bold(res.name)}: ${status}  (${res.passed} passed, ${
      res.failed
    } failed)`
  );
  if (res.error) console.log(`  ${c.red("ERROR")} ${res.error}`);
}

// Print an aggregate summary table (used by run-all). Returns true if all ok.
export function printSummary(results) {
  console.log(
    c.bold(c.cyan("\n================ SHIP-GATE SUMMARY ================"))
  );
  const nameW = Math.max(...results.map((r) => r.name.length), 4);
  for (const r of results) {
    const status = r.ok ? c.green("PASS") : c.red("FAIL");
    console.log(
      `  ${status}  ${r.name.padEnd(nameW)}  ${r.passed} passed, ${
        r.failed
      } failed${r.error ? `  [${r.error}]` : ""}`
    );
  }
  const allOk = results.every((r) => r.ok);
  console.log(
    c.bold(allOk ? c.green("\nALL GATES PASSED") : c.red("\nSOME GATES FAILED"))
  );
  return allOk;
}
