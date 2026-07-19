import type { NextApiRequest, NextApiResponse } from "next";
import deleteMember from "@/lib/api/controllers/boards/members/deleteMember";
import verifyUser from "@/lib/api/verifyUser";

export default async function member(req: NextApiRequest, res: NextApiResponse) {
  const user = await verifyUser({ req, res });
  if (!user) return;

  const boardId = Number(req.query.id);
  const memberUserId = Number(req.query.userId);

  if (req.method === "DELETE") {
    if (process.env.NEXT_PUBLIC_DEMO === "true")
      return res.status(400).json({
        response:
          "This action is disabled because this is a read-only demo of Muninn.",
      });

    const result = await deleteMember(user.id, boardId, memberUserId);
    return res.status(result.status).json({ response: result.response });
  }
}
