"use client";

import { Tabs, TabsList, TabsPanel, TabsTab } from "@mantine/core";
import {
  IconAlertTriangle,
  IconBrush,
  IconClick,
  IconFileTypeCss,
  IconLayout,
  IconPhoto,
  IconSettings,
  IconUser,
} from "@tabler/icons-react";

import type { RouterOutputs } from "@homarr/api";
import { BoardProvider } from "@homarr/boards/context";
import { useScopedI18n } from "@homarr/translation/client";

import type { Board } from "~/app/[locale]/boards/_types";
import { ColorSettingsContent } from "~/app/[locale]/boards/[name]/settings/_appereance";
import { BackgroundSettingsContent } from "~/app/[locale]/boards/[name]/settings/_background";
import { BehaviorSettingsContent } from "~/app/[locale]/boards/[name]/settings/_behavior";
import { BoardAccessSettings } from "~/app/[locale]/boards/[name]/settings/_board-access";
import { CustomCssSettingsContent } from "~/app/[locale]/boards/[name]/settings/_customCss";
import { DangerZoneSettingsContent } from "~/app/[locale]/boards/[name]/settings/_danger";
import { GeneralSettingsContent } from "~/app/[locale]/boards/[name]/settings/_general";
import { LayoutSettingsContent } from "~/app/[locale]/boards/[name]/settings/_layout";

interface BoardSettingsTabsProps {
  board: Board;
  permissions: RouterOutputs["board"]["getBoardPermissions"];
  hasFullAccess: boolean;
  hideVisibility: boolean;
  defaultTab: string;
}

export const BoardSettingsTabs = ({
  board,
  permissions,
  hasFullAccess,
  hideVisibility,
  defaultTab,
}: BoardSettingsTabsProps) => {
  const t = useScopedI18n("board.setting.section");

  return (
    <BoardProvider initialBoard={board}>
      <Tabs defaultValue={defaultTab} variant="outline" keepMounted={false}>
        <TabsList mb="md">
          <TabsTab value="general" leftSection={<IconSettings size="1rem" />}>
            {t("general.title")}
          </TabsTab>
          <TabsTab value="layout" leftSection={<IconLayout size="1rem" />}>
            {t("layout.title")}
          </TabsTab>
          <TabsTab value="background" leftSection={<IconPhoto size="1rem" />}>
            {t("background.title")}
          </TabsTab>
          <TabsTab value="appearance" leftSection={<IconBrush size="1rem" />}>
            {t("appearance.title")}
          </TabsTab>
          <TabsTab value="customCss" leftSection={<IconFileTypeCss size="1rem" />}>
            {t("customCss.title")}
          </TabsTab>
          <TabsTab value="behavior" leftSection={<IconClick size="1rem" />}>
            {t("behavior.title")}
          </TabsTab>
          {hasFullAccess && (
            <>
              <TabsTab value="access" leftSection={<IconUser size="1rem" />}>
                {t("access.title")}
              </TabsTab>
              <TabsTab value="dangerZone" color="red" leftSection={<IconAlertTriangle size="1rem" />}>
                {t("dangerZone.title")}
              </TabsTab>
            </>
          )}
        </TabsList>

        <TabsPanel value="general">
          <GeneralSettingsContent board={board} />
        </TabsPanel>
        <TabsPanel value="layout">
          <LayoutSettingsContent board={board} />
        </TabsPanel>
        <TabsPanel value="background">
          <BackgroundSettingsContent board={board} />
        </TabsPanel>
        <TabsPanel value="appearance">
          <ColorSettingsContent board={board} />
        </TabsPanel>
        <TabsPanel value="customCss">
          <CustomCssSettingsContent board={board} />
        </TabsPanel>
        <TabsPanel value="behavior">
          <BehaviorSettingsContent board={board} />
        </TabsPanel>
        {hasFullAccess && (
          <>
            <TabsPanel value="access">
              <BoardAccessSettings board={board} initialPermissions={permissions} />
            </TabsPanel>
            <TabsPanel value="dangerZone">
              <DangerZoneSettingsContent hideVisibility={hideVisibility} />
            </TabsPanel>
          </>
        )}
      </Tabs>
    </BoardProvider>
  );
};
