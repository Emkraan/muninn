import { prisma } from "@linkwarden/prisma";
import getPermission from "@/lib/api/getPermission";
import type { Board, BoardMember } from "@linkwarden/prisma/client";

type BoardWithMembers = Board & { members: BoardMember[] };

/**
 * Centralized board access decisions. Callers first resolve the board via
 * getBoardPermission, then use these pure predicates. Read is implied by
 * ownership or membership-row existence (no canRead column), exactly like the
 * collection model. Create/Update/Delete map to the member flags; board
 * settings, membership edits, and board deletion require ownership or canManage.
 */

export function isBoardOwner(board: BoardWithMembers | null, userId: number) {
  return !!board && board.ownerId === userId;
}

export function boardMember(board: BoardWithMembers | null, userId: number) {
  return board?.members.find((m) => m.userId === userId) ?? null;
}

export function canReadBoard(board: BoardWithMembers | null, userId: number) {
  if (!board) return false;
  return board.ownerId === userId || !!boardMember(board, userId);
}

export function canCreateOnBoard(board: BoardWithMembers | null, userId: number) {
  if (!board) return false;
  return board.ownerId === userId || !!boardMember(board, userId)?.canCreate;
}

export function canUpdateOnBoard(board: BoardWithMembers | null, userId: number) {
  if (!board) return false;
  return board.ownerId === userId || !!boardMember(board, userId)?.canUpdate;
}

export function canDeleteOnBoard(board: BoardWithMembers | null, userId: number) {
  if (!board) return false;
  return board.ownerId === userId || !!boardMember(board, userId)?.canDelete;
}

/** Manage = edit board settings/members or delete the board. Owner or canManage. */
export function canManageBoard(board: BoardWithMembers | null, userId: number) {
  if (!board) return false;
  return board.ownerId === userId || !!boardMember(board, userId)?.canManage;
}

/**
 * CRITICAL for kind=link items. A board membership must NEVER leak links the
 * user cannot otherwise read. This re-checks the underlying Link's read
 * permission live (owner or member of the link's collection, or the collection
 * is public) - it does not trust board membership and does not trust a snapshot
 * taken at placement time, because the source link/collection membership can be
 * revoked after the item was placed.
 */
export async function canReadLink(
  userId: number,
  linkId: number
): Promise<boolean> {
  const collection = await getPermission({ userId, linkId });
  if (!collection) return false;
  if (collection.isPublic) return true;
  if (collection.ownerId === userId) return true;
  return collection.members.some((m) => m.userId === userId);
}
