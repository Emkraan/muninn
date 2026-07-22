import { notFound } from "next/navigation";

import { api } from "@homarr/api/server";
import { auth } from "@homarr/auth/next";
import { env } from "@homarr/docker/env";
import { getScopedI18n } from "@homarr/translation/server";

import { IngressesTable } from "~/app/[locale]/manage/tools/kubernetes/ingresses/ingresses-table";
import { ManagePageLayout } from "~/components/manage/manage-page-layout";

export default async function NamespacesPage() {
  const session = await auth();
  if (!(session?.user.permissions.includes("admin") && env.ENABLE_KUBERNETES)) {
    notFound();
  }

  const ingresses = await api.kubernetes.ingresses.getIngresses();
  const tIngresses = await getScopedI18n("kubernetes.ingresses");
  return (
    <ManagePageLayout title={tIngresses("label")}>
      <IngressesTable initialIngresses={ingresses} />
    </ManagePageLayout>
  );
}
