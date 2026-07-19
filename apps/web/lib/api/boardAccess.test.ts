import { describe, it, expect } from "vitest";
import {
  isBoardOwner,
  boardMember,
  canReadBoard,
  canCreateOnBoard,
  canUpdateOnBoard,
  canDeleteOnBoard,
  canManageBoard,
} from "./boardAccess";

function board(ownerId: number, members: any[] = []) {
  return { id: 1, ownerId, members } as any;
}
const member = (userId: number, flags: Partial<Record<string, boolean>> = {}) => ({
  userId,
  boardId: 1,
  canCreate: false,
  canUpdate: false,
  canDelete: false,
  canManage: false,
  ...flags,
});

describe("boardAccess predicates", () => {
  it("null board denies everything", () => {
    for (const fn of [
      canReadBoard,
      canCreateOnBoard,
      canUpdateOnBoard,
      canDeleteOnBoard,
      canManageBoard,
    ]) {
      expect(fn(null, 1)).toBe(false);
    }
    expect(isBoardOwner(null, 1)).toBe(false);
    expect(boardMember(null, 1)).toBeNull();
  });

  it("owner can do everything", () => {
    const b = board(7);
    expect(isBoardOwner(b, 7)).toBe(true);
    expect(canReadBoard(b, 7)).toBe(true);
    expect(canCreateOnBoard(b, 7)).toBe(true);
    expect(canUpdateOnBoard(b, 7)).toBe(true);
    expect(canDeleteOnBoard(b, 7)).toBe(true);
    expect(canManageBoard(b, 7)).toBe(true);
  });

  it("read is implied by membership-row existence, no flag needed", () => {
    const b = board(7, [member(9)]);
    expect(canReadBoard(b, 9)).toBe(true);
    // ...but write flags are all false
    expect(canCreateOnBoard(b, 9)).toBe(false);
    expect(canUpdateOnBoard(b, 9)).toBe(false);
    expect(canDeleteOnBoard(b, 9)).toBe(false);
    expect(canManageBoard(b, 9)).toBe(false);
  });

  it("member write flags map correctly", () => {
    const b = board(7, [member(9, { canCreate: true, canUpdate: true })]);
    expect(canCreateOnBoard(b, 9)).toBe(true);
    expect(canUpdateOnBoard(b, 9)).toBe(true);
    expect(canDeleteOnBoard(b, 9)).toBe(false);
    expect(canManageBoard(b, 9)).toBe(false);
  });

  it("canManage requires owner or the canManage flag", () => {
    const b = board(7, [member(9, { canManage: true }), member(10)]);
    expect(canManageBoard(b, 9)).toBe(true);
    expect(canManageBoard(b, 10)).toBe(false);
  });

  it("a non-member, non-owner is fully denied", () => {
    const b = board(7, [member(9, { canCreate: true })]);
    expect(canReadBoard(b, 999)).toBe(false);
    expect(canCreateOnBoard(b, 999)).toBe(false);
  });
});
