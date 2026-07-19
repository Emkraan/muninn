import type { NextApiRequest, NextApiResponse } from "next";
import updateWidgetType from "@/lib/api/controllers/widgetTypes/updateWidgetType";
import deleteWidgetType from "@/lib/api/controllers/widgetTypes/deleteWidgetType";
import verifyUser from "@/lib/api/verifyUser";

const demoGuard = (res: NextApiResponse) =>
  res.status(400).json({
    response:
      "This action is disabled because this is a read-only demo of Muninn.",
  });

export default async function widgetType(
  req: NextApiRequest,
  res: NextApiResponse
) {
  const user = await verifyUser({ req, res });
  if (!user) return;

  const key = String(req.query.key);

  if (req.method === "PUT") {
    if (process.env.NEXT_PUBLIC_DEMO === "true") return demoGuard(res);
    const result = await updateWidgetType(user, key, req.body);
    return res.status(result.status).json({ response: result.response });
  } else if (req.method === "DELETE") {
    if (process.env.NEXT_PUBLIC_DEMO === "true") return demoGuard(res);
    const result = await deleteWidgetType(user, key);
    return res.status(result.status).json({ response: result.response });
  }
}
