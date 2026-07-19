import { prisma } from "@linkwarden/prisma";
import getBoardPermission from "@/lib/api/getBoardPermission";
import { canUpdateOnBoard } from "@/lib/api/boardAccess";
import {
  ItemPositionSchema,
  ItemPositionSchemaType,
} from "@linkwarden/lib/schemaValidation";

// PATCH /api/v1/boards/:id/items/:itemId/position - single-item reposition.
export default async function updateItemPosition(
  userId: number,
  boardId: number,
  itemId: number,
  body: ItemPositionSchemaType
) {
  if (!boardId || !itemId)
    return { response: "Please choose a valid item.", status: 400 };

  const dataValidation = ItemPositionSchema.safeParse(body);
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

  if (data.sectionId != null) {
    const section = await prisma.section.findFirst({
      where: { id: data.sectionId, boardId },
      select: { id: true },
    });
    if (!section)
      return { response: "Section does not belong to this board.", status: 400 };
  }

  const item = await prisma.boardItem.update({
    where: { id: itemId },
    data: {
      sectionId: data.sectionId,
      x: data.x,
      y: data.y,
      w: data.w,
      h: data.h,
      order: data.order,
    },
  });

  return { response: item, status: 200 };
}
