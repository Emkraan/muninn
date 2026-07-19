import { prisma } from "@linkwarden/prisma";

export default async function getBoards(userId: number) {
  const boards = await prisma.board.findMany({
    where: {
      OR: [{ ownerId: userId }, { members: { some: { userId } } }],
    },
    include: {
      _count: {
        select: { sections: true },
      },
      members: {
        include: {
          user: {
            select: { id: true, username: true, name: true, image: true },
          },
        },
      },
    },
    orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }, { id: "asc" }],
  });

  return { response: boards, status: 200 };
}
