import { notFound } from "next/navigation";

import { api } from "@homarr/api/server";
import { auth } from "@homarr/auth/next";
import { env } from "@homarr/docker/env";
import { getScopedI18n } from "@homarr/translation/server";

import { PodsTable } from "~/app/[locale]/manage/tools/kubernetes/pods/pods-table";
import { ManagePageLayout } from "~/components/manage/manage-page-layout";

export default async function PodsPage() {
  const session = await auth();
  if (!(session?.user.permissions.includes("other-manage-kubernetes") && env.ENABLE_KUBERNETES)) {
    notFound();
  }

  const pods = await api.kubernetes.pods.getPods();
  const tPods = await getScopedI18n("kubernetes.pods");
  return (
    <ManagePageLayout title={tPods("label")}>
      <PodsTable initialPods={pods} />
    </ManagePageLayout>
  );
}
