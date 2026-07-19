import { prisma } from "@linkwarden/prisma";
import getBoardPermission from "@/lib/api/getBoardPermission";
import { canManageBoard } from "@/lib/api/boardAccess";

export default async function deleteMember(
  userId: number,
  boardId: number,
  memberUserId: number
) {
  if (!boardId || !memberUserId)
    return { response: "Please choose a valid member.", status: 400 };

  const board = await getBoardPermission({ userId, boardId });

  // A member may always remove themselves (leave); otherwise manage is required.
  const isSelf = memberUserId === userId;
  if (!isSelf && !canManageBoard(board, userId))
    return { response: "Board is not accessible.", status: 401 };
  if (isSelf && !board)
    return { response: "Board is not accessible.", status: 401 };

  const existing = await prisma.boardMember.findUnique({
    where: { userId_boardId: { userId: memberUserId, boardId } },
  });
  if (!existing) return { response: "Member not found.", status: 404 };

  const deleted = await prisma.boardMember.delete({
    where: { userId_boardId: { userId: memberUserId, boardId } },
  });

  return { response: deleted, status: 200 };
}
