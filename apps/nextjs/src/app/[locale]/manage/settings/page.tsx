import { notFound } from "next/navigation";
import { Stack, Tabs, TabsList, TabsPanel, TabsTab, Text, Title } from "@mantine/core";
import { IconBrush, IconLanguage, IconLayoutDashboard, IconRobot, IconSearch, IconUser } from "@tabler/icons-react";

import { api } from "@homarr/api/server";
import { auth } from "@homarr/auth/next";
import { getScopedI18n } from "@homarr/translation/server";

import { CrawlingAndIndexingSettings } from "~/app/[locale]/manage/settings/_components/crawling-and-indexing.settings";
import { ManagePageLayout } from "~/components/manage/manage-page-layout";
import { AppearanceSettingsForm } from "./_components/appearance-settings-form";
import { BoardSettingsForm } from "./_components/board-settings-form";
import { CultureSettingsForm } from "./_components/culture-settings-form";
import { SearchSettingsForm } from "./_components/search-settings-form";
import { UserSettingsForm } from "./_components/user-settings-form";

export async function generateMetadata() {
  const t = await getScopedI18n("management");
  const metaTitle = `${t("metaTitle")} • Muninn`;

  return {
    title: metaTitle,
  };
}

export default async function SettingsPage() {
  const session = await auth();

  if (!session?.user.permissions.includes("admin")) {
    notFound();
  }

  const serverSettings = await api.serverSettings.getAll();
  const tSettings = await getScopedI18n("management.page.settings");

  const SectionHeader = ({ title }: { title: string }) => (
    <div>
      <Title order={2}>{title}</Title>
      <Text size="sm" c="dimmed">
        {tSettings("serverWideDefaultNotice")}
      </Text>
    </div>
  );

  return (
    <ManagePageLayout title={tSettings("title")}>
      <Tabs defaultValue="crawlingAndIndexing" variant="outline" keepMounted={false}>
        <TabsList mb="md">
          <TabsTab value="crawlingAndIndexing" leftSection={<IconRobot size="1rem" />}>
            {tSettings("section.crawlingAndIndexing.title")}
          </TabsTab>
          <TabsTab value="board" leftSection={<IconLayoutDashboard size="1rem" />}>
            {tSettings("section.board.title")}
          </TabsTab>
          <TabsTab value="user" leftSection={<IconUser size="1rem" />}>
            {tSettings("section.user.title")}
          </TabsTab>
          <TabsTab value="search" leftSection={<IconSearch size="1rem" />}>
            {tSettings("section.search.title")}
          </TabsTab>
          <TabsTab value="appearance" leftSection={<IconBrush size="1rem" />}>
            {tSettings("section.appearance.title")}
          </TabsTab>
          <TabsTab value="culture" leftSection={<IconLanguage size="1rem" />}>
            {tSettings("section.culture.title")}
          </TabsTab>
        </TabsList>

        <TabsPanel value="crawlingAndIndexing">
          <Stack>
            <Text size="sm" c="dimmed">
              {tSettings("serverWideDefaultNotice")}
            </Text>
            <CrawlingAndIndexingSettings initialData={serverSettings.crawlingAndIndexing} />
          </Stack>
        </TabsPanel>
        <TabsPanel value="board">
          <Stack>
            <SectionHeader title={tSettings("section.board.title")} />
            <BoardSettingsForm defaultValues={serverSettings.board} />
          </Stack>
        </TabsPanel>
        <TabsPanel value="user">
          <Stack>
            <SectionHeader title={tSettings("section.user.title")} />
            <UserSettingsForm defaultValues={serverSettings.user} />
          </Stack>
        </TabsPanel>
        <TabsPanel value="search">
          <Stack>
            <SectionHeader title={tSettings("section.search.title")} />
            <SearchSettingsForm defaultValues={serverSettings.search} />
          </Stack>
        </TabsPanel>
        <TabsPanel value="appearance">
          <Stack>
            <SectionHeader title={tSettings("section.appearance.title")} />
            <AppearanceSettingsForm defaultValues={serverSettings.appearance} />
          </Stack>
        </TabsPanel>
        <TabsPanel value="culture">
          <Stack>
            <SectionHeader title={tSettings("section.culture.title")} />
            <CultureSettingsForm defaultValues={serverSettings.culture} />
          </Stack>
        </TabsPanel>
      </Tabs>
    </ManagePageLayout>
  );
}
