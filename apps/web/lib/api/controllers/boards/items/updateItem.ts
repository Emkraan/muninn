import { prisma } from "@linkwarden/prisma";
import getBoardPermission from "@/lib/api/getBoardPermission";
import { canUpdateOnBoard } from "@/lib/api/boardAccess";
import { isWidgetTypeKnown } from "@/lib/widgets";
import {
  UpdateBoardItemSchema,
  UpdateBoardItemSchemaType,
} from "@linkwarden/lib/schemaValidation";

export default async function updateItem(
  userId: number,
  boardId: number,
  itemId: number,
  body: UpdateBoardItemSchemaType
) {
  if (!boardId || !itemId)
    return { response: "Please choose a valid item.", status: 400 };

  const dataValidation = UpdateBoardItemSchema.safeParse(body);
  if (!dataValidation.success) {
    return {
      response: `Error: ${
        dataValidation.error.issues[0].message
      } [${dataValidation.error.issues[0].path.join(", ")}]`,
      status: 400,
    };
  }

  const data = dataValidation.data;

  const board = await getBoardPermission({ userId, itemId });
  if (!board || board.id !== boardId)
    return { response: "Item is not accessible.", status: 401 };
  if (!canUpdateOnBoard(board, userId))
    return { response: "Item is not accessible.", status: 401 };

  const existing = await prisma.boardItem.findUnique({
    where: { id: itemId },
    select: { kind: true },
  });
  if (!existing) return { response: "Item not found.", status: 404 };

  // Moving to another section: it must belong to the same board.
  if (data.sectionId != null) {
    const section = await prisma.section.findFirst({
      where: { id: data.sectionId, boardId },
      select: { id: true },
    });
    if (!section)
      return { response: "Section does not belong to this board.", status: 400 };
  }

  // widgetType/widgetConfig only apply to widget items.
  if ((data.widgetType || data.widgetConfig) && existing.kind !== "widget")
    return {
      response: "Cannot set widget config on a non-widget item.",
      status: 400,
    };

  if (data.widgetType) {
    const known = await isWidgetTypeKnown(data.widgetType);
    if (!known) return { response: "Unknown widget type.", status: 400 };
  }

  const item = await prisma.boardItem.update({
    where: { id: itemId },
    data: {
      sectionId: data.sectionId,
      widgetType: existing.kind === "widget" ? data.widgetType ?? undefined : undefined,
      widgetConfig:
        existing.kind === "widget" ? (data.widgetConfig ?? undefined) : undefined,
      x: data.x,
      y: data.y,
      w: data.w,
      h: data.h,
      order: data.order,
    },
    include: { link: true },
  });

  return { response: item, status: 200 };
}
