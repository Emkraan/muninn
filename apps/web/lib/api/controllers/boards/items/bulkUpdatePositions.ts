import { prisma } from "@linkwarden/prisma";
import getBoardPermission from "@/lib/api/getBoardPermission";
import { canUpdateOnBoard } from "@/lib/api/boardAccess";
import {
  BulkItemPositionSchema,
  BulkItemPositionSchemaType,
} from "@linkwarden/lib/schemaValidation";

// PATCH /api/v1/boards/:id/items/positions - reposition many items in ONE call.
// This is the direct regression fix for the Homarr failure mode: a full board
// reorganization (move every item, across sections) is a single scriptable call
// with zero UI interaction.
export default async function bulkUpdatePositions(
  userId: number,
  boardId: number,
  body: BulkItemPositionSchemaType
) {
  if (!boardId) return { response: "Please choose a valid board.", status: 400 };

  const dataValidation = BulkItemPositionSchema.safeParse(body);
  if (!dataValidation.success) {
    return {
      response: `Error: ${
        dataValidation.error.issues[0].message
      } [${dataValidation.error.issues[0].path.join(", ")}]`,
      status: 400,
    };
  }

  const { items } = dataValidation.data;

  const board = await getBoardPermission({ userId, boardId });
  if (!canUpdateOnBoard(board, userId))
    return { response: "Board is not accessible.", status: 401 };

  // Every referenced item must belong to a section of THIS board.
  const itemIds = items.map((i) => i.id);
  const ownedItems = await prisma.boardItem.findMany({
    where: { id: { in: itemIds }, section: { boardId } },
    select: { id: true },
  });
  const ownedIds = new Set(ownedItems.map((i) => i.id));
  const foreign = itemIds.filter((id) => !ownedIds.has(id));
  if (foreign.length > 0)
    return {
      response: `These items do not belong to this board: ${foreign.join(", ")}`,
      status: 400,
    };

  // Every target section must belong to THIS board.
  const targetSectionIds = Array.from(
    new Set(
      items
        .map((i) => i.sectionId)
        .filter((s): s is number => typeof s === "number")
    )
  );
  if (targetSectionIds.length > 0) {
    const validSections = await prisma.section.findMany({
      where: { id: { in: targetSectionIds }, boardId },
      select: { id: true },
    });
    const validIds = new Set(validSections.map((s) => s.id));
    const badSections = targetSectionIds.filter((s) => !validIds.has(s));
    if (badSections.length > 0)
      return {
        response: `These sections do not belong to this board: ${badSections.join(
          ", "
        )}`,
        status: 400,
      };
  }

  const updated = await prisma.$transaction(
    items.map((i) =>
      prisma.boardItem.update({
        where: { id: i.id },
        data: {
          sectionId: i.sectionId,
          x: i.x,
          y: i.y,
          w: i.w,
          h: i.h,
          order: i.order,
        },
      })
    )
  );

  return { response: updated, status: 200 };
}
