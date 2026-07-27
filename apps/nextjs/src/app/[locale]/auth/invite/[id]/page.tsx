import { notFound } from "next/navigation";
import { Box, Text, Title } from "@mantine/core";

import { auth } from "@homarr/auth/next";
import { isProviderEnabled } from "@homarr/auth/server";
import { and, db, eq } from "@homarr/db";
import { invites } from "@homarr/db/schema";
import { getScopedI18n } from "@homarr/translation/server";

import { MuninnLogo } from "~/components/layout/logo/muninn-logo";
import classes from "../../login/login.module.css";
import { RavenMascot } from "../../login/_raven-mascot";
import { RegistrationForm } from "./_registration-form";

interface InviteUsagePageProps {
  params: Promise<{
    id: string;
  }>;
  searchParams: Promise<{
    token: string;
  }>;
}

export default async function InviteUsagePage(props: InviteUsagePageProps) {
  const searchParams = await props.searchParams;
  const params = await props.params;
  if (!isProviderEnabled("credentials")) notFound();

  const session = await auth();
  if (session) notFound();

  const invite = await db.query.invites.findFirst({
    where: and(eq(invites.id, params.id), eq(invites.token, searchParams.token)),
    columns: {
      id: true,
      token: true,
      expirationDate: true,
    },
    with: {
      creator: {
        columns: {
          name: true,
        },
      },
    },
  });

  if (!invite || invite.expirationDate < new Date()) notFound();

  const t = await getScopedI18n("user.page.invite");

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
          <RegistrationForm invite={invite} />
          <Text size="xs" c="dimmed" ta="center" mt="md">
            {/* eslint-disable-next-line @typescript-eslint/no-non-null-assertion */}
            {t("description", { username: invite.creator.name! })}
          </Text>
        </div>
      </Box>
    </Box>
  );
}
