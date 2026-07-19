import { prisma } from "@linkwarden/prisma";
import {
  PostBoardSchema,
  PostBoardSchemaType,
} from "@linkwarden/lib/schemaValidation";

export default async function postBoard(
  body: PostBoardSchemaType,
  userId: number
) {
  const dataValidation = PostBoardSchema.safeParse(body);

  if (!dataValidation.success) {
    return {
      response: `Error: ${
        dataValidation.error.issues[0].message
      } [${dataValidation.error.issues[0].path.join(", ")}]`,
      status: 400,
    };
  }

  const data = dataValidation.data;

  const newBoard = await prisma.$transaction(async (tx) => {
    // At most one default ("home") board per owner.
    if (data.isDefault) {
      await tx.board.updateMany({
        where: { ownerId: userId, isDefault: true },
        data: { isDefault: false },
      });
    }

    return tx.board.create({
      data: {
        name: data.name.trim(),
        description: data.description ?? "",
        color: data.color,
        icon: data.icon,
        isDefault: data.isDefault ?? false,
        isPublic: data.isPublic ?? false,
        owner: { connect: { id: userId } },
        createdBy: { connect: { id: userId } },
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

  return { response: newBoard, status: 200 };
}
