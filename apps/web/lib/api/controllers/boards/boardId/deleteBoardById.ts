import { prisma } from "@linkwarden/prisma";
import getBoardPermission from "@/lib/api/getBoardPermission";
import { boardMember } from "@/lib/api/boardAccess";

export default async function deleteBoardById(userId: number, boardId: number) {
  if (!boardId) return { response: "Please choose a valid board.", status: 400 };

  const board = await getBoardPermission({ userId, boardId });

  if (!board) return { response: "Board is not accessible.", status: 401 };

  // A non-owner member "deleting" the board only leaves it (removes their own
  // membership row), mirroring deleteCollectionById's leave semantics.
  if (board.ownerId !== userId) {
    if (boardMember(board, userId)) {
      const left = await prisma.boardMember.delete({
        where: { userId_boardId: { userId, boardId } },
      });
      return { response: left, status: 200 };
    }
    return { response: "Board is not accessible.", status: 401 };
  }

  // Owner: full cascade delete (sections, items, members via onDelete: Cascade).
  const deleted = await prisma.board.delete({ where: { id: boardId } });

  return { response: deleted, status: 200 };
}
