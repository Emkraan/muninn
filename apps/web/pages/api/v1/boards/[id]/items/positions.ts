import type { NextApiRequest, NextApiResponse } from "next";
import bulkUpdatePositions from "@/lib/api/controllers/boards/items/bulkUpdatePositions";
import verifyUser from "@/lib/api/verifyUser";

// PATCH /api/v1/boards/:id/items/positions - reposition many items in one call.
// (Static route; takes priority over the dynamic [itemId] sibling.)
export default async function positions(
  req: NextApiRequest,
  res: NextApiResponse
) {
  const user = await verifyUser({ req, res });
  if (!user) return;

  const boardId = Number(req.query.id);

  if (req.method === "PATCH") {
    if (process.env.NEXT_PUBLIC_DEMO === "true")
      return res.status(400).json({
        response:
          "This action is disabled because this is a read-only demo of Muninn.",
      });

    const result = await bulkUpdatePositions(user.id, boardId, req.body);
    return res.status(result.status).json({ response: result.response });
  }
}
