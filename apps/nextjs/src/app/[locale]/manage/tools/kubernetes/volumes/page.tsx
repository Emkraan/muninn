import { notFound } from "next/navigation";

import { api } from "@homarr/api/server";
import { auth } from "@homarr/auth/next";
import { env } from "@homarr/docker/env";
import { getScopedI18n } from "@homarr/translation/server";

import { VolumesTable } from "~/app/[locale]/manage/tools/kubernetes/volumes/volumes-table";
import { ManagePageLayout } from "~/components/manage/manage-page-layout";

export default async function VolumesPage() {
  const session = await auth();
  if (!(session?.user.permissions.includes("other-manage-kubernetes") && env.ENABLE_KUBERNETES)) {
    notFound();
  }

  const volumes = await api.kubernetes.volumes.getVolumes();
  const tVolumes = await getScopedI18n("kubernetes.volumes");
  return (
    <ManagePageLayout title={tVolumes("label")}>
      <VolumesTable initialVolumes={volumes} />
    </ManagePageLayout>
  );
}
