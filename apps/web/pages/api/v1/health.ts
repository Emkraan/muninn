import type { NextApiRequest, NextApiResponse } from "next";
import { prisma } from "@linkwarden/prisma";

// Unauthenticated health endpoint (mounted before any auth gate). Reports
// per-subsystem status for probes and the admin System Health view.
export default async function health(
  _req: NextApiRequest,
  res: NextApiResponse
) {
  const subsystems: Record<string, { ok: boolean; message?: string }> = {};

  // Database
  try {
    await prisma.$queryRaw`SELECT 1`;
    subsystems.database = { ok: true };
  } catch (e) {
    subsystems.database = {
      ok: false,
      message: e instanceof Error ? e.message : "unreachable",
    };
  }

  // Search (configured?)
  subsystems.search = process.env.MEILI_HOST
    ? { ok: true }
    : { ok: true, message: "not configured (optional)" };

  const ok = Object.values(subsystems).every((s) => s.ok);

  return res.status(ok ? 200 : 503).json({
    ok,
    service: "muninn",
    version: process.env.MUNINN_VERSION || "0.1.4",
    subsystems,
    timestamp: new Date().toISOString(),
  });
}
