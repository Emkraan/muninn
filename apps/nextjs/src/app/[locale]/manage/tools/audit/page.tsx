import { notFound } from "next/navigation";

import { api } from "@homarr/api/server";
import { auth } from "@homarr/auth/next";
import { getScopedI18n } from "@homarr/translation/server";

import { ManagePageLayout } from "~/components/manage/manage-page-layout";
import { createMetaTitle } from "~/metadata";
import { AuditTable } from "./_components/audit-table";

export async function generateMetadata() {
  const session = await auth();
  if (!session?.user.permissions.includes("admin")) {
    return {};
  }
  const t = await getScopedI18n("management");
  return {
    title: createMetaTitle(t("metaTitle")),
  };
}

export default async function AuditPage() {
  const session = await auth();
  if (!session?.user.permissions.includes("admin")) {
    notFound();
  }

  const { entries } = await api.audit.list({ limit: 100 });
  const tAudit = await getScopedI18n("management.page.tool.audit");

  return (
    <ManagePageLayout title={tAudit("title")}>
      <AuditTable initialEntries={entries} />
    </ManagePageLayout>
  );
}
