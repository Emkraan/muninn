import os from "os";

import { NextResponse } from "next/server";

import { db } from "@homarr/db";
import { adminAudit } from "@homarr/db/schema";

export async function GET() {
  const subsystems: Record<string, { ok: boolean; status: string; message?: string; [key: string]: unknown }> = {};

  // App subsystem — always available; surfaces runtime metadata.
  const mem = process.memoryUsage();
  subsystems.app = {
    ok: true,
    status: "up",
    version: process.env.npm_package_version ?? process.env.APP_VERSION ?? "unknown",
    runtime: `Node.js ${process.version}`,
    uptime: Math.floor(process.uptime()),
    memory: { rss: mem.rss, heapUsed: mem.heapUsed },
    hostname: os.hostname(),
  };

  // DB check — distinguish a missing/unconfigured URL from a degraded connection.
  // Muninn uses DB_DRIVER + DB_URL (or DB_HOST/PORT/USER/PASSWORD/NAME for remote DBs).
  // The default driver is better-sqlite3 which uses a file path; those deployments are
  // always "configured" even without an explicit DB_URL.
  const driver = process.env.DB_DRIVER ?? "better-sqlite3";
  const hasUrl = Boolean(process.env.DB_URL);
  const hasHost = Boolean(process.env.DB_HOST);
  const dbConfigured = driver === "better-sqlite3" || hasUrl || hasHost;

  if (!dbConfigured) {
    subsystems.db = { ok: false, status: "down", message: "DB_URL / DB_HOST not configured" };
  } else {
    try {
      await db.query.serverSettings.findFirst();
      subsystems.db = { ok: true, status: "up" };
    } catch (e) {
      subsystems.db = { ok: false, status: "degraded", message: String(e) };
    }
  }

  // Audit check — verify the audit table is accessible.
  try {
    await db.select().from(adminAudit).limit(1);
    subsystems.audit = { ok: true, status: "up" };
  } catch (e) {
    subsystems.audit = { ok: false, status: "down", message: String(e) };
  }

  const allOk = Object.values(subsystems).every((s) => s.ok);
  return NextResponse.json({ ok: allOk, subsystems }, { status: allOk ? 200 : 503 });
}
