import { NextResponse } from "next/server";

import { db } from "@homarr/db";
import { adminAudit } from "@homarr/db/schema";

export async function GET() {
  const subsystems: Record<string, { ok: boolean; status: string; message?: string }> = {};

  // DB check — use the ORM query builder (raw sql`SELECT 1` is unsupported on
  // the SQLite driver, see the /api/health/live note).
  try {
    await db.query.serverSettings.findFirst();
    subsystems.db = { ok: true, status: "up" };
  } catch (e) {
    subsystems.db = { ok: false, status: "down", message: String(e) };
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
