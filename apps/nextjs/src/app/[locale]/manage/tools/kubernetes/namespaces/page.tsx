import { notFound } from "next/navigation";

import { api } from "@homarr/api/server";
import { auth } from "@homarr/auth/next";
import { env } from "@homarr/docker/env";
import { getScopedI18n } from "@homarr/translation/server";

import { NamespacesTable } from "~/app/[locale]/manage/tools/kubernetes/namespaces/namespaces-table";
import { ManagePageLayout } from "~/components/manage/manage-page-layout";

export default async function NamespacesPage() {
  const session = await auth();
  if (!(session?.user.permissions.includes("admin") && env.ENABLE_KUBERNETES)) {
    notFound();
  }

  const namespaces = await api.kubernetes.namespaces.getNamespaces();
  const tNamespaces = await getScopedI18n("kubernetes.namespaces");
  return (
    <ManagePageLayout title={tNamespaces("label")}>
      <NamespacesTable initialNamespaces={namespaces} />
    </ManagePageLayout>
  );
}
