import { notFound } from "next/navigation";

import { api } from "@homarr/api/server";
import { auth } from "@homarr/auth/next";
import { env } from "@homarr/docker/env";
import { getScopedI18n } from "@homarr/translation/server";

import { SecretsTable } from "~/app/[locale]/manage/tools/kubernetes/secrets/secrets-table";
import { ManagePageLayout } from "~/components/manage/manage-page-layout";

export default async function SecretsPage() {
  const session = await auth();
  if (!(session?.user.permissions.includes("other-manage-kubernetes") && env.ENABLE_KUBERNETES)) {
    notFound();
  }

  const secrets = await api.kubernetes.secrets.getSecrets();
  const tSecrets = await getScopedI18n("kubernetes.secrets");
  return (
    <ManagePageLayout title={tSecrets("label")}>
      <SecretsTable initialSecrets={secrets} />
    </ManagePageLayout>
  );
}
