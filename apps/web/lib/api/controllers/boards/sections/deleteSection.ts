import { prisma } from "@linkwarden/prisma";
import getBoardPermission from "@/lib/api/getBoardPermission";
import { canDeleteOnBoard } from "@/lib/api/boardAccess";

export default async function deleteSection(
  userId: number,
  boardId: number,
  sectionId: number
) {
  if (!boardId || !sectionId)
    return { response: "Please choose a valid section.", status: 400 };

  const board = await getBoardPermission({ userId, sectionId });
  if (!board || board.id !== boardId)
    return { response: "Section is not accessible.", status: 401 };
  if (!canDeleteOnBoard(board, userId))
    return { response: "Section is not accessible.", status: 401 };

  // Items in the section are removed via onDelete: Cascade.
  const deleted = await prisma.section.delete({ where: { id: sectionId } });

  return { response: deleted, status: 200 };
}
