import { notFound } from "next/navigation";

import { api } from "@homarr/api/server";
import { auth } from "@homarr/auth/next";
import { env } from "@homarr/docker/env";
import { getScopedI18n } from "@homarr/translation/server";

import { NodesTable } from "~/app/[locale]/manage/tools/kubernetes/nodes/nodes-table";
import { ManagePageLayout } from "~/components/manage/manage-page-layout";

export default async function NodesPage() {
  const session = await auth();
  if (!(session?.user.permissions.includes("other-manage-kubernetes") && env.ENABLE_KUBERNETES)) {
    notFound();
  }

  const nodes = await api.kubernetes.nodes.getNodes();
  const tNodes = await getScopedI18n("kubernetes.nodes");
  return (
    <ManagePageLayout title={tNodes("label")}>
      <NodesTable initialNodes={nodes} />
    </ManagePageLayout>
  );
}
