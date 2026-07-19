import type { NextApiRequest, NextApiResponse } from "next";
import getAuditLog from "@/lib/api/controllers/admin/getAuditLog";
import verifyUser from "@/lib/api/verifyUser";

// GET /api/v1/admin/audit - admin-only tamper-evident audit log (never pruned).
export default async function audit(req: NextApiRequest, res: NextApiResponse) {
  const user = await verifyUser({ req, res });
  if (!user) return;

  if (req.method === "GET") {
    const take = req.query.take ? Number(req.query.take) : undefined;
    const cursor = req.query.cursor ? Number(req.query.cursor) : undefined;
    const result = await getAuditLog(user, { take, cursor });
    return res.status(result.status).json({ response: result.response });
  }
}
