import { prisma } from "@linkwarden/prisma";
import getBoardPermission from "@/lib/api/getBoardPermission";
import { canReadBoard } from "@/lib/api/boardAccess";

export default async function getMembers(userId: number, boardId: number) {
  if (!boardId) return { response: "Please choose a valid board.", status: 400 };

  const board = await getBoardPermission({ userId, boardId });
  if (!canReadBoard(board, userId))
    return { response: "Board is not accessible.", status: 401 };

  const members = await prisma.boardMember.findMany({
    where: { boardId },
    include: {
      user: {
        select: { id: true, username: true, name: true, image: true },
      },
    },
  });

  return { response: members, status: 200 };
}
