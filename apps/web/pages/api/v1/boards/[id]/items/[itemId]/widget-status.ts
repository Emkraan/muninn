import type { NextApiRequest, NextApiResponse } from "next";
import getItemWidgetStatus from "@/lib/api/controllers/boards/items/getItemWidgetStatus";
import verifyUser from "@/lib/api/verifyUser";

// GET /api/v1/boards/:id/items/:itemId/widget-status - live widget payload.
export default async function widgetStatus(
  req: NextApiRequest,
  res: NextApiResponse
) {
  const user = await verifyUser({ req, res });
  if (!user) return;

  const boardId = Number(req.query.id);
  const itemId = Number(req.query.itemId);

  if (req.method === "GET") {
    const result = await getItemWidgetStatus(user.id, boardId, itemId);
    return res.status(result.status).json({ response: result.response });
  }
}
