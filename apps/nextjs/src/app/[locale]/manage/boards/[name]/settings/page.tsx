import { notFound } from "next/navigation";
import { TRPCError } from "@trpc/server";

import { api } from "@homarr/api/server";
import { capitalize } from "@homarr/common";
import { db } from "@homarr/db";
import { getServerSettingByKeyAsync } from "@homarr/db/queries";
import type { TranslationObject } from "@homarr/translation";
import { getScopedI18n } from "@homarr/translation/server";

import { getBoardPermissionsAsync } from "~/components/board/permissions/server";
import { ManagePageLayout } from "~/components/manage/manage-page-layout";
import { DynamicBreadcrumb } from "~/components/navigation/dynamic-breadcrumb";
import { BoardSettingsTabs } from "./_board-settings-tabs";

interface Props {
  params: Promise<{
    name: string;
  }>;
  searchParams: Promise<{
    tab?: keyof TranslationObject["board"]["setting"]["section"];
  }>;
}

const getBoardAndPermissionsAsync = async (params: Awaited<Props["params"]>) => {
  try {
    const board = await api.board.getBoardByName({ name: params.name });
    const { hasFullAccess } = await getBoardPermissionsAsync(board);
    const permissions = hasFullAccess
      ? await api.board.getBoardPermissions({ id: board.id })
      : {
          users: [],
          groups: [],
          inherited: [],
        };

    return { board, permissions };
  } catch (error) {
    if (error instanceof TRPCError && error.code === "NOT_FOUND") {
      notFound();
    }

    if (error instanceof TRPCError && error.code === "BAD_REQUEST") {
      notFound();
    }

    throw error;
  }
};

export default async function ManageBoardSettingsPage(props: Props) {
  const searchParams = await props.searchParams;
  const params = await props.params;
  const { board, permissions } = await getBoardAndPermissionsAsync(params);
  const boardSettings = await getServerSettingByKeyAsync(db, "board");
  const { hasFullAccess, hasChangeAccess } = await getBoardPermissionsAsync(board);
  const t = await getScopedI18n("board.setting");
  const tBoardAction = await getScopedI18n("management.page.board.action");

  if (!hasChangeAccess) {
    notFound();
  }

  const hideVisibility = boardSettings.homeBoardId === board.id || boardSettings.mobileHomeBoardId === board.id;

  return (
    <ManagePageLayout
      title={t("title", { boardName: capitalize(board.name) })}
      size="xl"
      breadcrumb={
        <DynamicBreadcrumb
          dynamicMappings={
            new Map([
              [params.name, board.name],
              ["settings", tBoardAction("settings.label")],
            ])
          }
          nonInteractable={[params.name]}
        />
      }
    >
      <BoardSettingsTabs
        board={board}
        permissions={permissions}
        hasFullAccess={hasFullAccess}
        hideVisibility={hideVisibility}
        defaultTab={searchParams.tab ?? "general"}
      />
    </ManagePageLayout>
  );
}
