import type { NextApiRequest, NextApiResponse } from "next";
import verifyUser from "@/lib/api/verifyUser";
import isServerAdmin from "@/lib/api/isServerAdmin";
import { verifyAuditChain } from "@/lib/api/auditLog";

// GET /api/v1/admin/audit/verify - verify the audit hash chain integrity.
export default async function verify(req: NextApiRequest, res: NextApiResponse) {
  const user = await verifyUser({ req, res });
  if (!user) return;

  if (!isServerAdmin(user))
    return res.status(403).json({ response: "Admin access required." });

  if (req.method === "GET") {
    const result = await verifyAuditChain();
    return res.status(200).json({ response: result });
  }
}
