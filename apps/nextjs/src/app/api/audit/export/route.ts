/**
 * GET /api/audit/export
 *
 * Streams the admin audit log as a CSV attachment (admin-hub-standard §2.4).
 * Requires the `admin` permission.
 *
 * CSV columns: ts, actor_email, action, target_id, detail
 * The `detail` cell contains a compact JSON string of the row's detail field;
 * it is RFC-4180 quoted so any embedded commas, quotes, or newlines survive
 * round-trip through standard spreadsheet tools.
 *
 * Optional query params:
 *   actor    - email substring filter
 *   action   - action substring filter
 *   start    - ISO date lower bound (inclusive)
 *   end      - ISO date upper bound (inclusive)
 */

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { auth } from "@homarr/auth/next";
import { and, asc, db, gte, like, lte } from "@homarr/db";
import { adminAudit } from "@homarr/db/schema";

// RFC-4180 field quoting: wrap in double-quotes, escape internal double-quotes.
const csvField = (value: string | null | undefined): string => {
  const s = value ?? "";
  if (s.includes(",") || s.includes('"') || s.includes("\n") || s.includes("\r")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
};

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user.permissions.includes("other-audit-export")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = request.nextUrl;
  const actor = searchParams.get("actor");
  const action = searchParams.get("action");
  const start = searchParams.get("start");
  const end = searchParams.get("end");

  // Build WHERE conditions from query params.
  const conditions = [];
  if (actor) conditions.push(like(adminAudit.userEmail, `%${actor}%`));
  if (action) conditions.push(like(adminAudit.action, `%${action}%`));
  if (start) conditions.push(gte(adminAudit.timestamp, new Date(start)));
  if (end) conditions.push(lte(adminAudit.timestamp, new Date(end)));

  const rows = await db
    .select()
    .from(adminAudit)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(asc(adminAudit.timestamp));

  // Build CSV in memory. The audit log is append-only and rows are small; for
  // very large deployments this could be streamed, but in-memory is acceptable
  // for the homelab scale target.
  const header = "ts,actor_email,action,target_id,detail\r\n";
  const csvRows = rows.map((r) => {
    const ts = r.timestamp instanceof Date ? r.timestamp.toISOString() : new Date(r.timestamp).toISOString();
    return [csvField(ts), csvField(r.userEmail), csvField(r.action), csvField(r.targetId), csvField(r.detail)].join(
      ",",
    );
  });

  const csv = header + csvRows.join("\r\n");
  const exportedAt = new Date().toISOString().slice(0, 10);

  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="muninn-audit-${exportedAt}.csv"`,
      // Allow the SPA to read this header for the save-as filename hint.
      "Access-Control-Expose-Headers": "Content-Disposition",
    },
  });
}
