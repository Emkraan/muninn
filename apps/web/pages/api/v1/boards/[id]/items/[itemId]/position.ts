import type { NextApiRequest, NextApiResponse } from "next";
import updateItemPosition from "@/lib/api/controllers/boards/items/updateItemPosition";
import verifyUser from "@/lib/api/verifyUser";

// PATCH /api/v1/boards/:id/items/:itemId/position - single-item reposition.
export default async function itemPosition(
  req: NextApiRequest,
  res: NextApiResponse
) {
  const user = await verifyUser({ req, res });
  if (!user) return;

  const boardId = Number(req.query.id);
  const itemId = Number(req.query.itemId);

  if (req.method === "PATCH") {
    if (process.env.NEXT_PUBLIC_DEMO === "true")
      return res.status(400).json({
        response:
          "This action is disabled because this is a read-only demo of Muninn.",
      });

    const result = await updateItemPosition(user.id, boardId, itemId, req.body);
    return res.status(result.status).json({ response: result.response });
  }
}
