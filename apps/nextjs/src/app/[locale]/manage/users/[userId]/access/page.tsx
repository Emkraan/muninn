import { notFound } from "next/navigation";
import { Stack, Title } from "@mantine/core";

import { api } from "@homarr/api/server";
import { auth } from "@homarr/auth/next";
import { getScopedI18n } from "@homarr/translation/server";

import { catchTrpcNotFound, catchTrpcUnauthorized } from "~/errors/trpc-catch-error";
import { canAccessUserEditPage } from "../access";
import { UserAccessSections } from "./_access-sections";

interface Props {
  params: Promise<{
    userId: string;
  }>;
}

export default async function UserAccessPage(props: Props) {
  const params = await props.params;
  const session = await auth();
  const tAccess = await getScopedI18n("management.page.user.setting.access");
  const user = await api.user
    .getById({ userId: params.userId })
    .catch(catchTrpcNotFound)
    .catch(catchTrpcUnauthorized);

  if (!canAccessUserEditPage(session, user.id)) {
    notFound();
  }

  const access = await api.user.getAccessById({ userId: user.id });
  // Only holders of other-manage-users can edit; a user viewing their own
  // access map (allowed by canAccessUserEditPage) sees it read-only.
  const canManage = session?.user.permissions.includes("other-manage-users") ?? false;

  return (
    <Stack>
      <Title>{tAccess("title")}</Title>
      <UserAccessSections userId={user.id} initialData={access} canManage={canManage} />
    </Stack>
  );
}
