import { prisma } from "@linkwarden/prisma";
import getBoardPermission from "@/lib/api/getBoardPermission";
import { canReadBoard } from "@/lib/api/boardAccess";
import { fetchWidgetStatus } from "@/lib/widgets";

// Live status for a single widget item. Any board reader may poll it; the poll
// cadence is driven client-side by the widget type's defaultRefreshInterval.
export default async function getItemWidgetStatus(
  userId: number,
  boardId: number,
  itemId: number
) {
  if (!boardId || !itemId)
    return { response: "Please choose a valid item.", status: 400 };

  const board = await getBoardPermission({ userId, itemId });
  if (!board || board.id !== boardId || !canReadBoard(board, userId))
    return { response: "Item is not accessible.", status: 401 };

  const item = await prisma.boardItem.findUnique({
    where: { id: itemId },
    select: { kind: true, widgetType: true, widgetConfig: true },
  });

  if (!item) return { response: "Item not found.", status: 404 };
  if (item.kind !== "widget" || !item.widgetType)
    return { response: "Item is not a widget.", status: 400 };

  const status = await fetchWidgetStatus(
    item.widgetType,
    (item.widgetConfig as Record<string, unknown>) ?? {}
  );

  return { response: status, status: 200 };
}
