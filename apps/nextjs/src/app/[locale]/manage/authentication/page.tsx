import { notFound, redirect } from "next/navigation";
import { Stack, Text } from "@mantine/core";

import { api } from "@homarr/api/server";
import { auth } from "@homarr/auth/next";

import { ManagePageLayout } from "~/components/manage/manage-page-layout";
import { OidcProvidersManagement } from "./_oidc-providers-management";

export default async function AuthenticationPage() {
  const session = await auth();

  if (!session) {
    redirect("/auth/login");
  }

  if (!session.user.permissions.includes("other-manage-authentication")) {
    notFound();
  }

  const providers = await api.oidcProvider.all();

  return (
    <ManagePageLayout title="Authentication">
      <Stack gap="lg">
        <Text c="dimmed" size="sm" maw={720}>
          Configure the single sign-on providers users can authenticate with. Add one card per identity provider;
          changes apply on the next sign-in without a restart. Register the shown redirect URI with each provider.
        </Text>
        <OidcProvidersManagement providers={providers} />
      </Stack>
    </ManagePageLayout>
  );
}
