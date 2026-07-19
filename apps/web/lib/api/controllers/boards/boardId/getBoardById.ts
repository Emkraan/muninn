import { prisma } from "@linkwarden/prisma";
import getBoardPermission from "@/lib/api/getBoardPermission";
import { canReadBoard } from "@/lib/api/boardAccess";

export default async function getBoardById(userId: number, boardId: number) {
  if (!boardId) return { response: "Please choose a valid board.", status: 400 };

  const board = await getBoardPermission({ userId, boardId });

  if (!canReadBoard(board, userId))
    return { response: "Board is not accessible.", status: 401 };

  const fullBoard = await prisma.board.findUnique({
    where: { id: boardId },
    include: {
      members: {
        include: {
          user: {
            select: { id: true, username: true, name: true, image: true },
          },
        },
      },
      sections: {
        orderBy: [{ order: "asc" }, { id: "asc" }],
        include: {
          items: {
            orderBy: [{ order: "asc" }, { id: "asc" }],
            include: {
              link: {
                include: {
                  collection: {
                    select: { id: true, name: true, color: true, ownerId: true },
                  },
                  tags: { select: { id: true, name: true } },
                },
              },
            },
          },
        },
      },
    },
  });

  if (!fullBoard) return { response: "Board not found.", status: 404 };

  // CRITICAL: never leak links the viewer can't read via board membership.
  // Batch-resolve which of the referenced links this user may read (owner or
  // member of the link's collection, or the collection is public), then strip
  // link items that fail. Re-checked live, not from a placement-time snapshot.
  const linkIds = Array.from(
    new Set(
      fullBoard.sections
        .flatMap((s) => s.items)
        .filter((i) => i.kind === "link" && i.linkId != null)
        .map((i) => i.linkId as number)
    )
  );

  const readableLinkIds = new Set<number>();
  if (linkIds.length > 0) {
    const readable = await prisma.link.findMany({
      where: {
        id: { in: linkIds },
        collection: {
          OR: [
            { isPublic: true },
            { ownerId: userId },
            { members: { some: { userId } } },
          ],
        },
      },
      select: { id: true },
    });
    readable.forEach((l) => readableLinkIds.add(l.id));
  }

  const sanitizedSections = fullBoard.sections.map((section) => ({
    ...section,
    items: section.items.filter(
      (item) =>
        item.kind !== "link" ||
        (item.linkId != null && readableLinkIds.has(item.linkId))
    ),
  }));

  return {
    response: { ...fullBoard, sections: sanitizedSections },
    status: 200,
  };
}
