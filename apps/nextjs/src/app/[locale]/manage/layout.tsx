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
  const permissions = session?.user.permissions ?? [];
  const isAdmin = permissions.includes("admin");

  // Fine-grained admin capabilities. Because every "other-manage-*" key is a
  // child of "admin" (see getPermissionsWithChildren), a full admin holds all of
  // these via expansion and therefore still sees every group and item below.
  const canManageSettings = permissions.includes("other-manage-settings");
  const canManageAuthentication = permissions.includes("other-manage-authentication");
  const canManageUsers = permissions.includes("other-manage-users");
  const canManageGroups = permissions.includes("other-manage-groups");
  const canManageApiKeys = permissions.includes("other-manage-api-keys");
  const canManageCertificates = permissions.includes("other-manage-certificates");
  const canManageBackup = permissions.includes("other-manage-backup");
  const canManageDocker = permissions.includes("other-manage-docker");
  const canManageKubernetes = permissions.includes("other-manage-kubernetes");
  const canManageTasks = permissions.includes("other-manage-tasks");
  const canViewLogs = permissions.includes("other-view-logs");

  // A collapsible group is shown when the user holds ANY of its item permissions
  // (invites has no granular key and stays admin-only, so it also opens the group).
  const showSettingsGroup =
    canManageSettings ||
    canManageAuthentication ||
    canManageUsers ||
    canManageGroups ||
    canManageApiKeys ||
    canManageCertificates ||
    canManageBackup ||
    isAdmin;
  const showToolsGroup = canManageDocker || canManageKubernetes || canViewLogs || canManageTasks;

  // Unified admin hub IA: a few coherent groups instead of a flat list.
  // Home | Library (content) | Settings (all admin config incl. Authentication)
  // | Tools (operational) | Help | About.
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
      hidden: !showSettingsGroup,
      "data-onboarding-tour-id": "manage-settings",
      items: [
        {
          label: t("items.settings.general"),
          icon: IconSettingsFilled,
          href: "/manage/settings",
          hidden: !canManageSettings,
        },
        {
          label: t("items.settings.authentication"),
          icon: IconShieldLockFilled,
          href: "/manage/authentication",
          hidden: !canManageAuthentication,
        },
        {
          label: t("items.users.items.manage"),
          icon: IconUsers,
          href: "/manage/users",
          hidden: !canManageUsers,
        },
        {
          label: t("items.users.items.groups"),
          icon: IconUsersGroup,
          href: "/manage/users/groups",
          hidden: !canManageGroups,
        },
        {
          label: t("items.users.items.invites"),
          icon: IconMailForward,
          href: "/manage/users/invites",
          hidden: !isAdmin || !isProviderEnabled("credentials"),
        },
        {
          label: t("items.tools.items.api"),
          icon: IconDirectionsFilled,
          href: "/manage/tools/api",
          hidden: !canManageApiKeys,
        },
        {
          label: t("items.tools.items.certificates"),
          icon: IconCertificate,
          href: "/manage/tools/certificates",
          hidden: !canManageCertificates,
        },
        {
          label: t("items.tools.items.backup"),
          icon: IconDatabaseExport,
          href: "/manage/tools/backup",
          hidden: !canManageBackup || dbEnv.DRIVER !== "better-sqlite3",
        },
      ],
    },
    {
      label: t("items.tools.label"),
      icon: IconPointerFilled,
      // Shown when the user holds any operational Tools capability (docker,
      // kubernetes, logs or tasks); a full admin holds all of them via expansion.
      hidden: !showToolsGroup,
      items: [
        {
          label: t("items.tools.items.docker"),
          icon: IconBrandDocker,
          href: "/manage/tools/docker",
          hidden: !(canManageDocker && env.ENABLE_DOCKER),
        },
        {
          label: t("items.tools.items.kubernetes"),
          icon: IconBox,
          href: "/manage/tools/kubernetes",
          hidden: !(canManageKubernetes && env.ENABLE_KUBERNETES),
        },
        {
          label: t("items.tools.items.logs"),
          icon: IconBrandTablerFilled,
          href: "/manage/tools/logs",
          hidden: !canViewLogs,
        },
        {
          label: t("items.tools.items.tasks"),
          icon: IconClipboardListFilled,
          href: "/manage/tools/tasks",
          hidden: !canManageTasks,
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
