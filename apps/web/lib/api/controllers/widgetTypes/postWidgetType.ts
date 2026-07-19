import { prisma } from "@linkwarden/prisma";
import type { User } from "@linkwarden/prisma/client";
import isServerAdmin from "@/lib/api/isServerAdmin";
import { getBuiltinModule } from "@/lib/widgets";
import { writeAudit } from "@/lib/api/auditLog";
import {
  PostWidgetTypeSchema,
  PostWidgetTypeSchemaType,
} from "@linkwarden/lib/schemaValidation";

export default async function postWidgetType(
  user: User,
  body: PostWidgetTypeSchemaType
) {
  if (!isServerAdmin(user))
    return { response: "Admin access required.", status: 403 };

  const dataValidation = PostWidgetTypeSchema.safeParse(body);
  if (!dataValidation.success) {
    return {
      response: `Error: ${
        dataValidation.error.issues[0].message
      } [${dataValidation.error.issues[0].path.join(", ")}]`,
      status: 400,
    };
  }

  const data = dataValidation.data;

  // Custom keys must not shadow a built-in widget type.
  if (getBuiltinModule(data.key))
    return {
      response: "That key is reserved by a built-in widget type.",
      status: 400,
    };

  const exists = await prisma.widgetType.findUnique({ where: { key: data.key } });
  if (exists)
    return { response: "A widget type with that key already exists.", status: 400 };

  const created = await prisma.widgetType.create({
    data: {
      key: data.key,
      displayName: data.displayName,
      description: data.description ?? "",
      configSchema: data.configSchema,
      fetchSpec: data.fetchSpec,
      defaultRefreshIntervalSeconds: data.defaultRefreshIntervalSeconds ?? 60,
      createdBy: { connect: { id: user.id } },
    },
  });

  await writeAudit({
    actorId: user.id,
    actorLabel: user.email || user.username || `user:${user.id}`,
    action: "widgetType.create",
    target: `widgetType:${created.key}`,
    context: { displayName: created.displayName },
  });

  return { response: created, status: 200 };
}
