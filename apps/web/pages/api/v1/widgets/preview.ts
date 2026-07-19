import type { NextApiRequest, NextApiResponse } from "next";
import previewWidget from "@/lib/api/controllers/widgets/previewWidget";
import verifyUser from "@/lib/api/verifyUser";

// POST /api/v1/widgets/preview - test a widget config before saving it.
export default async function preview(
  req: NextApiRequest,
  res: NextApiResponse
) {
  const user = await verifyUser({ req, res });
  if (!user) return;

  if (req.method === "POST") {
    const result = await previewWidget(req.body);
    return res.status(result.status).json({ response: result.response });
  }
}
