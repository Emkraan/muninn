import type { NextApiRequest, NextApiResponse } from "next";
import getMembers from "@/lib/api/controllers/boards/members/getMembers";
import postMember from "@/lib/api/controllers/boards/members/postMember";
import verifyUser from "@/lib/api/verifyUser";

export default async function members(
  req: NextApiRequest,
  res: NextApiResponse
) {
  const user = await verifyUser({ req, res });
  if (!user) return;

  const boardId = Number(req.query.id);

  if (req.method === "GET") {
    const result = await getMembers(user.id, boardId);
    return res.status(result.status).json({ response: result.response });
  } else if (req.method === "POST") {
    if (process.env.NEXT_PUBLIC_DEMO === "true")
      return res.status(400).json({
        response:
          "This action is disabled because this is a read-only demo of Muninn.",
      });

    const result = await postMember(user.id, boardId, req.body);
    return res.status(result.status).json({ response: result.response });
  }
}
