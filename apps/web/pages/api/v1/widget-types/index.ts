import type { NextApiRequest, NextApiResponse } from "next";
import getWidgetTypes from "@/lib/api/controllers/widgetTypes/getWidgetTypes";
import postWidgetType from "@/lib/api/controllers/widgetTypes/postWidgetType";
import verifyUser from "@/lib/api/verifyUser";

export default async function widgetTypes(
  req: NextApiRequest,
  res: NextApiResponse
) {
  const user = await verifyUser({ req, res });
  if (!user) return;

  if (req.method === "GET") {
    const result = await getWidgetTypes();
    return res.status(result.status).json({ response: result.response });
  } else if (req.method === "POST") {
    if (process.env.NEXT_PUBLIC_DEMO === "true")
      return res.status(400).json({
        response:
          "This action is disabled because this is a read-only demo of Muninn.",
      });

    const result = await postWidgetType(user, req.body);
    return res.status(result.status).json({ response: result.response });
  }
}
