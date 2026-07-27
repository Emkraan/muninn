import { notFound } from "next/navigation";
import { Fieldset, Title } from "@mantine/core";

import { api } from "@homarr/api/server";
import { auth } from "@homarr/auth/next";
import { getI18n } from "@homarr/translation/server";

import { ManagePageLayout } from "~/components/manage/manage-page-layout";
import { DynamicBreadcrumb } from "~/components/navigation/dynamic-breadcrumb";
import { AppAccessSettings } from "../../_components/app-access-settings";
import { AppEditForm } from "./_app-edit-form";

interface AppEditPageProps {
  params: Promise<{ id: string }>;
}

export default async function AppEditPage(props: AppEditPageProps) {
  const params = await props.params;
  const session = await auth();

  if (!session) {
    notFound();
  }

  // Gate on exactly what app.update enforces: the global app-modify-all key OR a
  // per-app modify/full grant. Checking only the global key locked a user with
  // full access to this specific app out of the page entirely, even though the
  // mutation behind the form would have accepted their write.
  if (!(await api.app.canModify({ id: params.id }))) {
    notFound();
  }

  const app = await api.app.byId({ id: params.id });
  const t = await getI18n();

  // Only users with full access to this app (global app-full-all or a per-app
  // full grant) may view / change its sharing. getAppPermissions enforces this
  // server-side, so a failed fetch simply hides the panel.
  const appPermissions = await api.app.getAppPermissions({ id: app.id }).catch(() => null);

  return (
    <ManagePageLayout
      title={t("app.page.edit.title")}
      breadcrumb={<DynamicBreadcrumb dynamicMappings={new Map([[params.id, app.name]])} nonInteractable={["edit"]} />}
    >
      <AppEditForm app={app} />

      {appPermissions && (
        <>
          <Title order={2}>{t("permission.title")}</Title>
          <Fieldset>
            <AppAccessSettings app={app} initialPermissions={appPermissions} />
          </Fieldset>
        </>
      )}
    </ManagePageLayout>
  );
}
