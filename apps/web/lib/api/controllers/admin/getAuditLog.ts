import { prisma } from "@linkwarden/prisma";
import type { User } from "@linkwarden/prisma/client";
import isServerAdmin from "@/lib/api/isServerAdmin";

export default async function getAuditLog(
  user: User,
  opts: { take?: number; cursor?: number } = {}
) {
  if (!isServerAdmin(user))
    return { response: "Admin access required.", status: 403 };

  const take = Math.min(Math.max(opts.take ?? 100, 1), 500);

  const entries = await prisma.adminAudit.findMany({
    take,
    ...(opts.cursor ? { cursor: { id: opts.cursor }, skip: 1 } : {}),
    orderBy: { id: "desc" },
    include: {
      actor: { select: { id: true, username: true, email: true } },
    },
  });

  return { response: entries, status: 200 };
}
