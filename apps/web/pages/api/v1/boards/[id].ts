import type { NextApiRequest, NextApiResponse } from "next";
import getBoardById from "@/lib/api/controllers/boards/boardId/getBoardById";
import updateBoardById from "@/lib/api/controllers/boards/boardId/updateBoardById";
import deleteBoardById from "@/lib/api/controllers/boards/boardId/deleteBoardById";
import verifyUser from "@/lib/api/verifyUser";

const demoGuard = (res: NextApiResponse) =>
  res.status(400).json({
    response:
      "This action is disabled because this is a read-only demo of Muninn.",
  });

export default async function board(req: NextApiRequest, res: NextApiResponse) {
  const user = await verifyUser({ req, res });
  if (!user) return;

  const boardId = Number(req.query.id);

  if (req.method === "GET") {
    const result = await getBoardById(user.id, boardId);
    return res.status(result.status).json({ response: result.response });
  } else if (req.method === "PUT") {
    if (process.env.NEXT_PUBLIC_DEMO === "true") return demoGuard(res);
    const result = await updateBoardById(user.id, boardId, req.body);
    return res.status(result.status).json({ response: result.response });
  } else if (req.method === "DELETE") {
    if (process.env.NEXT_PUBLIC_DEMO === "true") return demoGuard(res);
    const result = await deleteBoardById(user.id, boardId);
    return res.status(result.status).json({ response: result.response });
  }
}
