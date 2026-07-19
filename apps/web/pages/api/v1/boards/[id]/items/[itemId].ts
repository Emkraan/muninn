import type { NextApiRequest, NextApiResponse } from "next";
import updateItem from "@/lib/api/controllers/boards/items/updateItem";
import deleteItem from "@/lib/api/controllers/boards/items/deleteItem";
import verifyUser from "@/lib/api/verifyUser";

const demoGuard = (res: NextApiResponse) =>
  res.status(400).json({
    response:
      "This action is disabled because this is a read-only demo of Muninn.",
  });

export default async function item(req: NextApiRequest, res: NextApiResponse) {
  const user = await verifyUser({ req, res });
  if (!user) return;

  const boardId = Number(req.query.id);
  const itemId = Number(req.query.itemId);

  if (req.method === "PUT") {
    if (process.env.NEXT_PUBLIC_DEMO === "true") return demoGuard(res);
    const result = await updateItem(user.id, boardId, itemId, req.body);
    return res.status(result.status).json({ response: result.response });
  } else if (req.method === "DELETE") {
    if (process.env.NEXT_PUBLIC_DEMO === "true") return demoGuard(res);
    const result = await deleteItem(user.id, boardId, itemId);
    return res.status(result.status).json({ response: result.response });
  }
}
