import { prisma } from "@linkwarden/prisma";
import getBoardPermission from "@/lib/api/getBoardPermission";
import { canDeleteOnBoard } from "@/lib/api/boardAccess";

export default async function deleteItem(
  userId: number,
  boardId: number,
  itemId: number
) {
  if (!boardId || !itemId)
    return { response: "Please choose a valid item.", status: 400 };

  const board = await getBoardPermission({ userId, itemId });
  if (!board || board.id !== boardId)
    return { response: "Item is not accessible.", status: 401 };
  if (!canDeleteOnBoard(board, userId))
    return { response: "Item is not accessible.", status: 401 };

  const deleted = await prisma.boardItem.delete({ where: { id: itemId } });

  return { response: deleted, status: 200 };
}
