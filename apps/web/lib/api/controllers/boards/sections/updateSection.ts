import { prisma } from "@linkwarden/prisma";
import getBoardPermission from "@/lib/api/getBoardPermission";
import { canUpdateOnBoard } from "@/lib/api/boardAccess";
import {
  UpdateSectionSchema,
  UpdateSectionSchemaType,
} from "@linkwarden/lib/schemaValidation";

export default async function updateSection(
  userId: number,
  boardId: number,
  sectionId: number,
  body: UpdateSectionSchemaType
) {
  if (!boardId || !sectionId)
    return { response: "Please choose a valid section.", status: 400 };

  const dataValidation = UpdateSectionSchema.safeParse(body);
  if (!dataValidation.success) {
    return {
      response: `Error: ${
        dataValidation.error.issues[0].message
      } [${dataValidation.error.issues[0].path.join(", ")}]`,
      status: 400,
    };
  }

  const data = dataValidation.data;

  const board = await getBoardPermission({ userId, sectionId });
  if (!board || board.id !== boardId)
    return { response: "Section is not accessible.", status: 401 };
  if (!canUpdateOnBoard(board, userId))
    return { response: "Section is not accessible.", status: 401 };

  const section = await prisma.section.update({
    where: { id: sectionId },
    data: {
      name: data.name?.trim(),
      order: data.order,
    },
  });

  return { response: section, status: 200 };
}
