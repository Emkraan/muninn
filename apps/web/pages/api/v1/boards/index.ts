import type { NextApiRequest, NextApiResponse } from "next";
import getBoards from "@/lib/api/controllers/boards/getBoards";
import postBoard from "@/lib/api/controllers/boards/postBoard";
import verifyUser from "@/lib/api/verifyUser";

export default async function boards(req: NextApiRequest, res: NextApiResponse) {
  const user = await verifyUser({ req, res });
  if (!user) return;

  if (req.method === "GET") {
    const result = await getBoards(user.id);
    return res.status(result.status).json({ response: result.response });
  } else if (req.method === "POST") {
    if (process.env.NEXT_PUBLIC_DEMO === "true")
      return res.status(400).json({
        response:
          "This action is disabled because this is a read-only demo of Muninn.",
      });

    const result = await postBoard(req.body, user.id);
    return res.status(result.status).json({ response: result.response });
  }
}
