import { prisma } from "@linkwarden/prisma";

type Props = {
  userId: number;
  boardId?: number;
  sectionId?: number;
  itemId?: number;
};

/**
 * Board-permission helper, a direct analogue of getPermission for collections.
 *
 * Given a userId and ONE of boardId / sectionId / itemId, it resolves the Board
 * the target belongs to together with its members (BoardMember rows), so the
 * caller can make the access decision itself by comparing userId against
 * board.ownerId and the members array (mirroring the collection controllers).
 *
 * - boardId branch filters by owner-or-member (returns null when the user has no
 *   relationship to the board), matching getPermission's built-in isolation.
 * - sectionId / itemId branches resolve the containing board WITHOUT filtering by
 *   userId (the security check is delegated to the caller), matching how
 *   getPermission's linkId branch behaves.
 *
 * Note: this intentionally returns the Board row (or null), NOT a boolean, to
 * stay consistent with the rest of the codebase and let callers apply the
 * per-action flag checks (canCreate/canUpdate/canDelete/canManage).
 */
export default async function getBoardPermission({
  userId,
  boardId,
  sectionId,
  itemId,
}: Props) {
  if (itemId) {
    return await prisma.board.findFirst({
      where: {
        sections: {
          some: {
            items: {
              some: { id: itemId },
            },
          },
        },
      },
      include: { members: true },
    });
  } else if (sectionId) {
    return await prisma.board.findFirst({
      where: {
        sections: {
          some: { id: sectionId },
        },
      },
      include: { members: true },
    });
  } else if (boardId) {
    return await prisma.board.findFirst({
      where: {
        id: boardId,
        OR: [{ ownerId: userId }, { members: { some: { userId } } }],
      },
      include: { members: true },
    });
  }

  return null;
}
