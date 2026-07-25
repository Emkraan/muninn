import type { PropsWithChildren } from "react";
import { AppShellMain } from "@mantine/core";
import {
  IconAffiliateFilled,
  IconApi,
  IconBook2,
  IconBox,
  IconBrandDocker,
  IconBrandGithub,
  IconBrandTablerFilled,
  IconCertificate,
  IconClipboardListFilled,
  IconDatabaseExport,
  IconDirectionsFilled,
  IconGitFork,
  IconHelpSquareRoundedFilled,
  IconHomeFilled,
  IconLayoutDashboardFilled,
  IconLibraryFilled,
  IconMailForward,
  IconPhotoFilled,
  IconPointerFilled,
  IconSearch,
  IconSettingsFilled,
  IconShieldLockFilled,
  IconUsers,
  IconUsersGroup,
} from "@tabler/icons-react";

import { auth } from "@homarr/auth/next";
import { isProviderEnabled } from "@homarr/auth/server";
import { createDocumentationLink } from "@homarr/definitions";
import { dbEnv } from "@homarr/core/infrastructure/db/env";
import { env } from "@homarr/docker/env";
import { getScopedI18n } from "@homarr/translation/server";

import { MainHeader } from "~/components/layout/header";
import { homarrLogoPath } from "~/components/layout/logo/homarr-logo";
import type { NavigationLink } from "~/components/layout/navigation";
import { MainNavigation } from "~/components/layout/navigation";
import { ClientShell } from "~/components/layout/shell";
import { ManageTourProvider } from "~/components/onboarding/manage-tour";

export default async function ManageLayout({ children }: PropsWithChildren) {
  const t = await getScopedI18n("management.navbar");
  const session = await auth();
  const isAdmin = session?.user.permissions.includes("admin") ?? false;

  // Unified admin hub IA (Emkraan admin-hub-standard): a few coherent groups
  // instead of a flat list. Home | Library (content) | Settings (all admin
  // config incl. Authentication) | Tools (operational) | Help | About.
  const navigationLinks: NavigationLink[] = [
    {
      label: t("items.home"),
      icon: IconHomeFilled,
      href: "/manage",
      "data-onboarding-tour-id": "manage-welcome",
    },
    {
      label: t("items.library"),
      icon: IconLibraryFilled,
      items: [
        {
          label: t("items.boards"),
          icon: IconLayoutDashboardFilled,
          href: "/manage/boards",
          "data-onboarding-tour-id": "manage-boards",
        },
        {
          label: t("items.apps"),
          icon: IconBox,
          href: "/manage/apps",
          hidden: !session,
          "data-onboarding-tour-id": "manage-apps",
        },
        {
          label: t("items.integrations"),
          icon: IconAffiliateFilled,
          href: "/manage/integrations",
          hidden: !session,
          "data-onboarding-tour-id": "manage-integrations",
        },
        {
          label: t("items.searchEngies"),
          icon: IconSearch,
          href: "/manage/search-engines",
          hidden: !session,
          "data-onboarding-tour-id": "manage-search-engines",
        },
        {
          label: t("items.medias"),
          icon: IconPhotoFilled,
          href: "/manage/medias",
          hidden: !session,
          "data-onboarding-tour-id": "manage-medias",
        },
        {
          label: t("items.customWidgets"),
          icon: IconApi,
          href: "/manage/custom-widgets",
          hidden: !session,
        },
      ],
    },
    {
      label: t("items.settings.label"),
      icon: IconSettingsFilled,
      hidden: !isAdmin,
      "data-onboarding-tour-id": "manage-settings",
      items: [
        {
          label: t("items.settings.general"),
          icon: IconSettingsFilled,
          href: "/manage/settings",
        },
        {
          label: t("items.settings.authentication"),
          icon: IconShieldLockFilled,
          href: "/manage/authentication",
        },
        {
          label: t("items.users.items.manage"),
          icon: IconUsers,
          href: "/manage/users",
        },
        {
          label: t("items.users.items.groups"),
          icon: IconUsersGroup,
          href: "/manage/users/groups",
        },
        {
          label: t("items.users.items.invites"),
          icon: IconMailForward,
          href: "/manage/users/invites",
          hidden: !isProviderEnabled("credentials"),
        },
        {
          label: t("items.tools.items.api"),
          icon: IconDirectionsFilled,
          href: "/manage/tools/api",
        },
        {
          label: t("items.tools.items.certificates"),
          icon: IconCertificate,
          href: "/manage/tools/certificates",
        },
        {
          label: t("items.tools.items.backup"),
          icon: IconDatabaseExport,
          href: "/manage/tools/backup",
          hidden: dbEnv.DRIVER !== "better-sqlite3",
        },
      ],
    },
    {
      label: t("items.tools.label"),
      icon: IconPointerFilled,
      // As permissions always include their children permissions, we can check other-view-logs as admin includes it
      hidden: !session?.user.permissions.includes("other-view-logs"),
      items: [
        {
          label: t("items.tools.items.docker"),
          icon: IconBrandDocker,
          href: "/manage/tools/docker",
          hidden: !(isAdmin && env.ENABLE_DOCKER),
        },
        {
          label: t("items.tools.items.kubernetes"),
          icon: IconBox,
          href: "/manage/tools/kubernetes",
          hidden: !(isAdmin && env.ENABLE_KUBERNETES),
        },
        {
          label: t("items.tools.items.logs"),
          icon: IconBrandTablerFilled,
          href: "/manage/tools/logs",
          hidden: !session?.user.permissions.includes("other-view-logs"),
        },
        {
          label: t("items.tools.items.tasks"),
          icon: IconClipboardListFilled,
          href: "/manage/tools/tasks",
          hidden: !isAdmin,
        },
      ],
    },
    {
      label: t("items.help.label"),
      icon: IconHelpSquareRoundedFilled,
      items: [
        {
          label: t("items.help.items.documentation"),
          icon: IconBook2,
          href: createDocumentationLink("/docs/getting-started"),
          external: true,
        },
        {
          label: t("items.help.items.submitIssue"),
          icon: IconBrandGithub,
          href: "https://github.com/Emkraan/muninn/issues/new/choose",
          external: true,
        },
        {
          label: t("items.help.items.sourceCode"),
          icon: IconGitFork,
          href: "https://github.com/Emkraan/muninn",
          external: true,
        },
      ],
    },
    {
      label: t("items.about"),
      icon: homarrLogoPath,
      href: "/manage/about",
    },
  ];

  const shell = (
    <ClientShell hasNavigation>
      <MainHeader></MainHeader>
      <MainNavigation links={navigationLinks}></MainNavigation>
      <AppShellMain>{children}</AppShellMain>
    </ClientShell>
  );

  if (!session) return shell;

  return <ManageTourProvider isAdmin={isAdmin}>{shell}</ManageTourProvider>;
}
