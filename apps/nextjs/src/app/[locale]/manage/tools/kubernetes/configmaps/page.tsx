import { notFound } from "next/navigation";

import { api } from "@homarr/api/server";
import { auth } from "@homarr/auth/next";
import { env } from "@homarr/docker/env";
import { getScopedI18n } from "@homarr/translation/server";

import { ConfigmapsTable } from "~/app/[locale]/manage/tools/kubernetes/configmaps/configmaps-table";
import { ManagePageLayout } from "~/components/manage/manage-page-layout";

export default async function ConfigMapsPage() {
  const session = await auth();
  if (!(session?.user.permissions.includes("admin") && env.ENABLE_KUBERNETES)) {
    notFound();
  }

  const configMaps = await api.kubernetes.configMaps.getConfigMaps();
  const tConfigMaps = await getScopedI18n("kubernetes.configmaps");

  return (
    <ManagePageLayout title={tConfigMaps("label")}>
      <ConfigmapsTable initialConfigMaps={configMaps} />
    </ManagePageLayout>
  );
}
