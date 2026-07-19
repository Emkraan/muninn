import type { NextApiRequest, NextApiResponse } from "next";
import postSection from "@/lib/api/controllers/boards/sections/postSection";
import verifyUser from "@/lib/api/verifyUser";

export default async function sections(
  req: NextApiRequest,
  res: NextApiResponse
) {
  const user = await verifyUser({ req, res });
  if (!user) return;

  const boardId = Number(req.query.id);

  if (req.method === "POST") {
    if (process.env.NEXT_PUBLIC_DEMO === "true")
      return res.status(400).json({
        response:
          "This action is disabled because this is a read-only demo of Muninn.",
      });

    const result = await postSection(user.id, boardId, req.body);
    return res.status(result.status).json({ response: result.response });
  }
}
