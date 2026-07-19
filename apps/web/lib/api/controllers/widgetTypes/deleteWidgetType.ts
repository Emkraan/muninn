import { prisma } from "@linkwarden/prisma";
import type { User } from "@linkwarden/prisma/client";
import isServerAdmin from "@/lib/api/isServerAdmin";
import { getBuiltinModule } from "@/lib/widgets";
import { writeAudit } from "@/lib/api/auditLog";

export default async function deleteWidgetType(user: User, key: string) {
  if (!isServerAdmin(user))
    return { response: "Admin access required.", status: 403 };

  if (!key) return { response: "Please choose a valid widget type.", status: 400 };
  if (getBuiltinModule(key))
    return { response: "Built-in widget types cannot be deleted.", status: 400 };

  const exists = await prisma.widgetType.findUnique({ where: { key } });
  if (!exists) return { response: "Widget type not found.", status: 404 };

  const deleted = await prisma.widgetType.delete({ where: { key } });

  await writeAudit({
    actorId: user.id,
    actorLabel: user.email || user.username || `user:${user.id}`,
    action: "widgetType.delete",
    target: `widgetType:${key}`,
  });

  return { response: deleted, status: 200 };
}
