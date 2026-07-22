import { notFound } from "next/navigation";

import { api } from "@homarr/api/server";
import { auth } from "@homarr/auth/next";
import { env } from "@homarr/docker/env";
import { getScopedI18n } from "@homarr/translation/server";

import { ServicesTable } from "~/app/[locale]/manage/tools/kubernetes/services/services-table";
import { ManagePageLayout } from "~/components/manage/manage-page-layout";

export default async function ServicesPage() {
  const session = await auth();
  if (!(session?.user.permissions.includes("admin") && env.ENABLE_KUBERNETES)) {
    notFound();
  }

  const services = await api.kubernetes.services.getServices();
  const tServices = await getScopedI18n("kubernetes.services");
  return (
    <ManagePageLayout title={tServices("label")}>
      <ServicesTable initialServices={services} />
    </ManagePageLayout>
  );
}
