import { notFound } from "next/navigation";

import { api } from "@homarr/api/server";
import { auth } from "@homarr/auth/next";
import { getScopedI18n } from "@homarr/translation/server";

import { ManagePageLayout } from "~/components/manage/manage-page-layout";
import { createMetaTitle } from "~/metadata";
import { TasksTable } from "./_components/tasks-table";

export async function generateMetadata() {
  const session = await auth();
  if (!session?.user.permissions.includes("other-manage-tasks")) {
    return {};
  }
  const t = await getScopedI18n("management");

  return {
    title: createMetaTitle(t("metaTitle")),
  };
}

export default async function TasksPage() {
  const session = await auth();
  if (!session?.user.permissions.includes("other-manage-tasks")) {
    notFound();
  }

  const jobs = await api.cronJobs.getJobs();
  const tTasks = await getScopedI18n("management.page.tool.tasks");

  return (
    <ManagePageLayout title={tTasks("title")}>
      <TasksTable initialJobs={jobs} />
    </ManagePageLayout>
  );
}
