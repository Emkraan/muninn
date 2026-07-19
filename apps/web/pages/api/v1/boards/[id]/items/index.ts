import type { NextApiRequest, NextApiResponse } from "next";
import postItem from "@/lib/api/controllers/boards/items/postItem";
import verifyUser from "@/lib/api/verifyUser";

export default async function items(req: NextApiRequest, res: NextApiResponse) {
  const user = await verifyUser({ req, res });
  if (!user) return;

  const boardId = Number(req.query.id);

  if (req.method === "POST") {
    if (process.env.NEXT_PUBLIC_DEMO === "true")
      return res.status(400).json({
        response:
          "This action is disabled because this is a read-only demo of Muninn.",
      });

    const result = await postItem(user.id, boardId, req.body);
    return res.status(result.status).json({ response: result.response });
  }
}
