import { notFound } from "next/navigation";
import { Alert, Box, Group, Stack, Title } from "@mantine/core";
import { IconExclamationCircle } from "@tabler/icons-react";

import { api } from "@homarr/api/server";
import { auth } from "@homarr/auth/next";
import { getI18n, getScopedI18n } from "@homarr/translation/server";

import { ManagePageLayout } from "~/components/manage/manage-page-layout";
import { createMetaTitle } from "~/metadata";
import { UserGeneralSettingsForm } from "../users/[userId]/general/_components/_general-settings-form";
import { UserProfileAvatarForm } from "../users/[userId]/general/_components/_profile-avatar-form";
import { ResetTours } from "../users/[userId]/general/_components/_reset-tours";

export async function generateMetadata() {
  const t = await getScopedI18n("management.page.preferences");

  return {
    title: createMetaTitle(t("metaTitle")),
  };
}

export default async function PreferencesPage() {
  const session = await auth();

  if (!session) {
    notFound();
  }

  const t = await getI18n();
  const tPreferences = await getScopedI18n("management.page.preferences");
  const tGeneral = await getScopedI18n("management.page.user.setting.general");

  const user = await api.user.getById({ userId: session.user.id }).catch(() => null);

  if (!user) {
    notFound();
  }

  const boards = await api.board.getAllBoards();
  const searchEngines = await api.searchEngine.getSelectable();
  const isCredentialsUser = user.provider === "credentials";

  return (
    <ManagePageLayout title={tPreferences("title")} size="xl">
      <Stack>
        {!isCredentialsUser && (
          <Alert variant="light" color="yellow" icon={<IconExclamationCircle size="1rem" stroke={1.5} />}>
            {t("management.page.user.fieldsDisabledExternalProvider")}
          </Alert>
        )}
        <Group gap="xl" align="flex-start" wrap="wrap">
          <Box flex={1} miw={{ base: "100%", md: 540 }}>
            <UserGeneralSettingsForm
              user={user}
              boardsData={boards.map((board) => ({
                id: board.id,
                name: board.name,
                logoImageUrl: board.logoImageUrl,
              }))}
              searchEnginesData={searchEngines}
              showLanguageSelector
            />
          </Box>
          <Box w={{ base: "100%", lg: 260 }}>
            <UserProfileAvatarForm user={user} />
          </Box>
        </Group>

        <Stack mb="lg">
          <Title order={2}>{tGeneral("item.onboardingTours.title")}</Title>
          <ResetTours />
        </Stack>
      </Stack>
    </ManagePageLayout>
  );
}
