import { prisma } from "@linkwarden/prisma";
import getBoardPermission from "@/lib/api/getBoardPermission";
import { canCreateOnBoard, canReadLink } from "@/lib/api/boardAccess";
import { isWidgetTypeKnown } from "@/lib/widgets";
import {
  PostBoardItemSchema,
  PostBoardItemSchemaType,
} from "@linkwarden/lib/schemaValidation";

export default async function postItem(
  userId: number,
  boardId: number,
  body: PostBoardItemSchemaType
) {
  if (!boardId) return { response: "Please choose a valid board.", status: 400 };

  const dataValidation = PostBoardItemSchema.safeParse(body);
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

  // The target section must belong to this board.
  const section = await prisma.section.findFirst({
    where: { id: data.sectionId, boardId },
    select: { id: true },
  });
  if (!section)
    return { response: "Section does not belong to this board.", status: 400 };

  if (data.kind === "link") {
    // Re-check the underlying link's read permission live - board membership is
    // NOT sufficient to place a link the user cannot otherwise read.
    const readable = await canReadLink(userId, data.linkId as number);
    if (!readable)
      return {
        response: "You do not have access to that link.",
        status: 403,
      };
  } else if (data.kind === "widget") {
    // Widget type must be a known built-in or a registered custom type.
    const known = await isWidgetTypeKnown(data.widgetType as string);
    if (!known)
      return { response: "Unknown widget type.", status: 400 };
  }

  // Default order to the end of the section if not supplied.
  let order = data.order;
  if (order == null) {
    const last = await prisma.boardItem.findFirst({
      where: { sectionId: data.sectionId },
      orderBy: { order: "desc" },
      select: { order: true },
    });
    order = (last?.order ?? -1) + 1;
  }

  const item = await prisma.boardItem.create({
    data: {
      sectionId: data.sectionId,
      kind: data.kind,
      linkId: data.kind === "link" ? data.linkId : null,
      widgetType: data.kind === "widget" ? data.widgetType : null,
      widgetConfig: data.kind === "widget" ? (data.widgetConfig ?? {}) : undefined,
      x: data.x ?? 0,
      y: data.y ?? 0,
      w: data.w ?? 1,
      h: data.h ?? 1,
      order,
    },
    include: { link: true },
  });

  return { response: item, status: 200 };
}
