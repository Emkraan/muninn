import { notFound } from "next/navigation";

import { api } from "@homarr/api/server";
import { auth } from "@homarr/auth/next";
import { env } from "@homarr/docker/env";
import { getScopedI18n } from "@homarr/translation/server";

import { ManagePageLayout } from "~/components/manage/manage-page-layout";
import { DockerTable } from "./docker-table";

export default async function DockerPage() {
  const session = await auth();
  if (!(session?.user.permissions.includes("other-manage-docker") && env.ENABLE_DOCKER)) {
    notFound();
  }

  const { containers, timestamp } = await api.docker.getContainers();
  const tDocker = await getScopedI18n("docker");

  return (
    <ManagePageLayout title={tDocker("title")}>
      <DockerTable initialData={{ containers, timestamp }} />
    </ManagePageLayout>
  );
}
