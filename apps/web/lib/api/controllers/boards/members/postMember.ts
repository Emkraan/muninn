import { prisma } from "@linkwarden/prisma";
import getBoardPermission from "@/lib/api/getBoardPermission";
import { canManageBoard } from "@/lib/api/boardAccess";
import {
  PostBoardMemberSchema,
  PostBoardMemberSchemaType,
} from "@linkwarden/lib/schemaValidation";

// Add or update a single board member (idempotent upsert). Manage-gated.
export default async function postMember(
  userId: number,
  boardId: number,
  body: PostBoardMemberSchemaType
) {
  if (!boardId) return { response: "Please choose a valid board.", status: 400 };

  const dataValidation = PostBoardMemberSchema.safeParse(body);
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

  if (data.userId === board!.ownerId)
    return { response: "The owner cannot be added as a member.", status: 400 };

  const target = await prisma.user.findUnique({
    where: { id: data.userId },
    select: { id: true },
  });
  if (!target) return { response: "User not found.", status: 404 };

  const member = await prisma.boardMember.upsert({
    where: { userId_boardId: { userId: data.userId, boardId } },
    create: {
      boardId,
      userId: data.userId,
      canCreate: data.canCreate ?? false,
      canUpdate: data.canUpdate ?? false,
      canDelete: data.canDelete ?? false,
      canManage: data.canManage ?? false,
    },
    update: {
      canCreate: data.canCreate,
      canUpdate: data.canUpdate,
      canDelete: data.canDelete,
      canManage: data.canManage,
    },
    include: {
      user: {
        select: { id: true, username: true, name: true, image: true },
      },
    },
  });

  return { response: member, status: 200 };
}
