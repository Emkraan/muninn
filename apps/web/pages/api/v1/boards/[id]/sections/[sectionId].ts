import type { NextApiRequest, NextApiResponse } from "next";
import updateSection from "@/lib/api/controllers/boards/sections/updateSection";
import deleteSection from "@/lib/api/controllers/boards/sections/deleteSection";
import verifyUser from "@/lib/api/verifyUser";

const demoGuard = (res: NextApiResponse) =>
  res.status(400).json({
    response:
      "This action is disabled because this is a read-only demo of Muninn.",
  });

export default async function section(
  req: NextApiRequest,
  res: NextApiResponse
) {
  const user = await verifyUser({ req, res });
  if (!user) return;

  const boardId = Number(req.query.id);
  const sectionId = Number(req.query.sectionId);

  if (req.method === "PUT") {
    if (process.env.NEXT_PUBLIC_DEMO === "true") return demoGuard(res);
    const result = await updateSection(user.id, boardId, sectionId, req.body);
    return res.status(result.status).json({ response: result.response });
  } else if (req.method === "DELETE") {
    if (process.env.NEXT_PUBLIC_DEMO === "true") return demoGuard(res);
    const result = await deleteSection(user.id, boardId, sectionId);
    return res.status(result.status).json({ response: result.response });
  }
}
