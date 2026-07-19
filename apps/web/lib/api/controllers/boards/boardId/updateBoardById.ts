import { prisma } from "@linkwarden/prisma";
import getBoardPermission from "@/lib/api/getBoardPermission";
import { canManageBoard } from "@/lib/api/boardAccess";
import {
  UpdateBoardSchema,
  UpdateBoardSchemaType,
} from "@linkwarden/lib/schemaValidation";

export default async function updateBoardById(
  userId: number,
  boardId: number,
  body: UpdateBoardSchemaType
) {
  if (!boardId) return { response: "Please choose a valid board.", status: 400 };

  const dataValidation = UpdateBoardSchema.safeParse(body);

  if (!dataValidation.success) {
    return {
      response: `Error: ${
        dataValidation.error.issues[0].message
      } [${dataValidation.error.issues[0].path.join(", ")}]`,
      status: 400,
    };
  }

  const data = dataValidation.data;

  const board = await getBoardPermission({ userId, boardId });

  if (!canManageBoard(board, userId))
    return { response: "Board is not accessible.", status: 401 };

  // The owner can never be demoted to a member; dedupe and exclude the owner.
  const uniqueMembers = (data.members ?? []).filter(
    (e, i, a) =>
      a.findIndex((el) => el.userId === e.userId) === i &&
      e.userId !== board!.ownerId
  );

  const updated = await prisma.$transaction(async (tx) => {
    if (data.isDefault) {
      await tx.board.updateMany({
        where: { ownerId: board!.ownerId, isDefault: true, id: { not: boardId } },
        data: { isDefault: false },
      });
    }

    // Membership is only touched when `members` was provided in the body.
    if (data.members) {
      await tx.boardMember.deleteMany({ where: { boardId } });
    }

    return tx.board.update({
      where: { id: boardId },
      data: {
        name: data.name.trim(),
        description: data.description,
        color: data.color,
        icon: data.icon,
        isDefault: data.isDefault,
        isPublic: data.isPublic,
        ...(data.members
          ? {
              members: {
                create: uniqueMembers.map((e) => ({
                  user: { connect: { id: e.userId } },
                  canCreate: e.canCreate,
                  canUpdate: e.canUpdate,
                  canDelete: e.canDelete,
                  canManage: e.canManage,
                })),
              },
            }
          : {}),
      },
      include: {
        _count: { select: { sections: true } },
        members: {
          include: {
            user: {
              select: { id: true, username: true, name: true, image: true },
            },
          },
        },
      },
    });
  });

  return { response: updated, status: 200 };
}
