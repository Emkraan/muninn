import { prisma } from "@linkwarden/prisma";
import type { User } from "@linkwarden/prisma/client";
import isServerAdmin from "@/lib/api/isServerAdmin";
import { getBuiltinModule } from "@/lib/widgets";
import { writeAudit } from "@/lib/api/auditLog";
import {
  UpdateWidgetTypeSchema,
  UpdateWidgetTypeSchemaType,
} from "@linkwarden/lib/schemaValidation";

export default async function updateWidgetType(
  user: User,
  key: string,
  body: UpdateWidgetTypeSchemaType
) {
  if (!isServerAdmin(user))
    return { response: "Admin access required.", status: 403 };

  if (!key) return { response: "Please choose a valid widget type.", status: 400 };
  if (getBuiltinModule(key))
    return { response: "Built-in widget types cannot be edited.", status: 400 };

  const dataValidation = UpdateWidgetTypeSchema.safeParse(body);
  if (!dataValidation.success) {
    return {
      response: `Error: ${
        dataValidation.error.issues[0].message
      } [${dataValidation.error.issues[0].path.join(", ")}]`,
      status: 400,
    };
  }

  const exists = await prisma.widgetType.findUnique({ where: { key } });
  if (!exists) return { response: "Widget type not found.", status: 404 };

  const data = dataValidation.data;

  const updated = await prisma.widgetType.update({
    where: { key },
    data: {
      displayName: data.displayName,
      description: data.description,
      configSchema: data.configSchema,
      fetchSpec: data.fetchSpec,
      defaultRefreshIntervalSeconds: data.defaultRefreshIntervalSeconds,
    },
  });

  await writeAudit({
    actorId: user.id,
    actorLabel: user.email || user.username || `user:${user.id}`,
    action: "widgetType.update",
    target: `widgetType:${key}`,
  });

  return { response: updated, status: 200 };
}
