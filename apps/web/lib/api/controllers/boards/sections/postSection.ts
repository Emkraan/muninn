import { prisma } from "@linkwarden/prisma";
import getBoardPermission from "@/lib/api/getBoardPermission";
import { canCreateOnBoard } from "@/lib/api/boardAccess";
import {
  PostSectionSchema,
  PostSectionSchemaType,
} from "@linkwarden/lib/schemaValidation";

export default async function postSection(
  userId: number,
  boardId: number,
  body: PostSectionSchemaType
) {
  if (!boardId) return { response: "Please choose a valid board.", status: 400 };

  const dataValidation = PostSectionSchema.safeParse(body);
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
  if (!canCreateOnBoard(board, userId))
    return { response: "Board is not accessible.", status: 401 };

  // Default new sections to the end of the board if no order was supplied.
  let order = data.order;
  if (order == null) {
    const last = await prisma.section.findFirst({
      where: { boardId },
      orderBy: { order: "desc" },
      select: { order: true },
    });
    order = (last?.order ?? -1) + 1;
  }

  const section = await prisma.section.create({
    data: { boardId, name: data.name.trim(), order },
    include: { items: true },
  });

  return { response: section, status: 200 };
}
