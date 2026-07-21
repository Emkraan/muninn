import { redirect } from "next/navigation";
import { Alert, Card, Center, Code, Stack, Text, Title } from "@mantine/core";
import { IconLogin } from "@tabler/icons-react";

import { env } from "@homarr/auth/env";
import { loadLoginProvidersAsync } from "@homarr/auth";
import { auth } from "@homarr/auth/next";
import { getScopedI18n } from "@homarr/translation/server";
import { sanitizeRedirectionUrl } from "@homarr/validation/redirection-url";

import { env as appEnv } from "~/env";

import { HomarrLogoWithTitle } from "~/components/layout/logo/homarr-logo";
import { LoginForm } from "./_login-form";

interface LoginProps {
  searchParams: Promise<{
    callbackUrl?: string;
  }>;
}

export default async function Login(props: LoginProps) {
  const searchParams = await props.searchParams;
  const session = await auth();

  if (session) {
    redirect(sanitizeRedirectionUrl(searchParams.callbackUrl));
  }

  const t = await getScopedI18n("user.page.login");
  // Emkraan multi-OIDC (P4): DB-configured provider buttons (enabled + show-on-login).
  const oidcProviders = await loadLoginProvidersAsync();

  return (
    <Center>
      <Stack align="center" mt="xl">
        <HomarrLogoWithTitle size="lg" />
        <Stack gap={6} align="center">
          <Title order={3} fw={400} ta="center">
            {t("title")}
          </Title>
          <Text size="sm" c="gray.5" ta="center">
            {t("subtitle")}
          </Text>
        </Stack>
        {appEnv.DEMO_MODE && (
          <Alert icon={<IconLogin size={18} />} color="blue" variant="light" w={64 * 6} maw="90vw">
            <Text size="sm" fw={500}>
              Demo mode is enabled. Sign in with username <Code>demo</Code> and password <Code>demo</Code>
            </Text>
          </Alert>
        )}
        <Card w={64 * 6} maw="90vw">
          <LoginForm
            providers={env.AUTH_PROVIDERS}
            oidcProviders={oidcProviders}
            callbackUrl={searchParams.callbackUrl ?? "/"}
          />
        </Card>
      </Stack>
    </Center>
  );
}
