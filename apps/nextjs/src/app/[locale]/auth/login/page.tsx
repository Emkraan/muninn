import { redirect } from "next/navigation";
import { Alert, Box, Code, Text, Title } from "@mantine/core";
import { IconLogin } from "@tabler/icons-react";

import { env } from "@homarr/auth/env";
import { loadLoginProvidersAsync } from "@homarr/auth";
import { auth } from "@homarr/auth/next";
import { getScopedI18n } from "@homarr/translation/server";
import { sanitizeRedirectionUrl } from "@homarr/validation/redirection-url";

import { env as appEnv } from "~/env";

import { MuninnLogo } from "~/components/layout/logo/muninn-logo";
import { LoginForm } from "./_login-form";
import { RavenMascot } from "./_raven-mascot";
import classes from "./login.module.css";

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
  // Multi-provider OIDC: DB-configured provider buttons (enabled + show-on-login).
  const oidcProviders = await loadLoginProvidersAsync();

  return (
    <Box className={classes.authPage}>
      <RavenMascot />
      <Box className={classes.authCard}>
        <div className={classes.authHead}>
          <div className={classes.logoBadge}>
            <MuninnLogo size={46} />
          </div>
          <Title order={2} fw={700}>
            Muninn
          </Title>
          <Text size="sm" c="dimmed" mt={4}>
            {t("subtitle")}
          </Text>
        </div>
        <div className={classes.authBody}>
          <Title order={4} ta="center" mb="lg" fw={600}>
            {t("title")}
          </Title>
          {appEnv.DEMO_MODE && (
            <Alert icon={<IconLogin size={18} />} color="cobalt" variant="light" mb="md">
              <Text size="sm" fw={500}>
                Demo mode is enabled. Sign in with username <Code>demo</Code> and password <Code>demo</Code>
              </Text>
            </Alert>
          )}
          <LoginForm
            providers={env.AUTH_PROVIDERS}
            oidcProviders={oidcProviders}
            callbackUrl={searchParams.callbackUrl ?? "/"}
          />
        </div>
      </Box>
    </Box>
  );
}
