import { notFound } from "next/navigation";

import { auth } from "@homarr/auth/next";
import { env } from "@homarr/docker/env";

import { ClusterDashboard } from "~/app/[locale]/manage/tools/kubernetes/cluster-dashboard/cluster-dashboard";
import { ManagePageLayout } from "~/components/manage/manage-page-layout";

export default async function KubernetesPage() {
  const session = await auth();
  if (!(session?.user.permissions.includes("other-manage-kubernetes") && env.ENABLE_KUBERNETES)) {
    notFound();
  }

  return (
    <ManagePageLayout>
      <ClusterDashboard />
    </ManagePageLayout>
  );
}
