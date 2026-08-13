import { NextResponse } from "next/server";

import { db } from "@homarr/db";
import { handshakeAsync } from "@homarr/redis";

export async function GET() {
  const subsystems: Record<string, { ok: boolean; status: string; message?: string; latency?: number }> = {};

  // Database liveness — use the ORM query builder; raw sql`SELECT 1` is unsupported
  // on the SQLite driver (better-sqlite3 in synchronous mode).
  const dbStart = Date.now();
  try {
    await db.query.serverSettings.findFirst();
    subsystems.database = { ok: true, status: "up", latency: Date.now() - dbStart };
  } catch (e) {
    subsystems.database = { ok: false, status: "down", message: String(e), latency: Date.now() - dbStart };
  }

  // Redis liveness.
  const redisStart = Date.now();
  try {
    await handshakeAsync();
    subsystems.redis = { ok: true, status: "up", latency: Date.now() - redisStart };
  } catch (e) {
    subsystems.redis = { ok: false, status: "down", message: String(e), latency: Date.now() - redisStart };
  }

  const allOk = Object.values(subsystems).every((s) => s.ok);
  return NextResponse.json({ ok: allOk, subsystems }, { status: allOk ? 200 : 503 });
}
