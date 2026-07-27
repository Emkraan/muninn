"use client";

import type { PropsWithChildren } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import type { OnboardingTourStep } from "@gfazioli/mantine-onboarding-tour";
import { useMediaQuery } from "@mantine/hooks";
import {
  IconAffiliateFilled,
  IconAppsFilled,
  IconLayoutDashboardFilled,
  IconPlus,
  IconUserFilled,
} from "@tabler/icons-react";

import { clientApi } from "@homarr/api/client";
import { createDocumentationLink } from "@homarr/definitions";
import { useScopedI18n } from "@homarr/translation/client";

import { TourShell } from "./tour-shell";
import { TourStepContent } from "./tour-step-content";

// What the current user can actually reach. Every step whose target only renders
// under a condition needs its condition here, otherwise the tour navigates to a
// page where its target does not exist and strands the user on a dimmed,
// click-blocked screen with no way to finish (see tour-shell.tsx).
export interface ManageTourCapabilities {
  canCreateBoards: boolean;
  canSeeApps: boolean;
  canCreateApps: boolean;
  canSeeIntegrations: boolean;
  canCreateIntegrations: boolean;
  canManageUsers: boolean;
  credentialsEnabled: boolean;
}

interface ManageTourProviderProps extends PropsWithChildren {
  capabilities: ManageTourCapabilities;
}

const stepRoutes: Record<string, string> = {
  "manage-welcome": "/manage",
  "manage-boards-list": "/manage/boards",
  "manage-boards-create": "/manage/boards",
  "manage-apps-list": "/manage/apps",
  "manage-apps-create": "/manage/apps",
  "manage-integrations-list": "/manage/integrations",
  "manage-integrations-create": "/manage/integrations",
  "manage-users-list": "/manage/users",
  "manage-users-create": "/manage/users",
};

export const ManageTourProvider = ({ children, capabilities }: ManageTourProviderProps) => {
  const t = useScopedI18n("onboardingTour.manage");
  const utils = clientApi.useUtils();
  const { data: tourStatus } = clientApi.user.getTourStatus.useQuery();
  const { mutate: completeTour } = clientApi.user.completeTour.useMutation({
    onSuccess() {
      void utils.user.getTourStatus.invalidate();
    },
    onError() {
      // Roll the optimistic write back so the tour is not silently marked done
      // server-side out of sync. tourDismissed stays true, so it does not
      // immediately restart in this session.
      utils.user.getTourStatus.setData(undefined, {
        completedManageTour: false,
        completedBoardTour: tourStatus?.completedBoardTour ?? false,
      });
    },
  });
  const isMobile = useMediaQuery("(max-width: 48em)");
  const pathname = usePathname();
  const router = useRouter();

  const isManageHome = /^(\/[^/]+)?\/manage\/?$/.test(pathname);
  const isManageSection = /^(\/[^/]+)?\/manage(\/.*)?$/.test(pathname);

  const [tourActive, setTourActive] = useState(false);
  const [tourDismissed, setTourDismissed] = useState(false);
  const wasManageTourCompletedRef = useRef(tourStatus?.completedManageTour);

  useEffect(() => {
    // Explicit stop branch: useMediaQuery resolves undefined on the first render,
    // so without this a late resolution (or a resize) could leave the
    // desktop-only tour running at a narrow width.
    if (isMobile) {
      setTourActive(false);
      return;
    }
    if (tourDismissed) return;
    if (isManageHome && tourStatus !== undefined && !tourStatus.completedManageTour) {
      setTourActive(true);
    }
  }, [isManageHome, tourStatus, isMobile, tourDismissed]);

  useEffect(() => {
    if (!isManageSection) {
      setTourActive(false);
    }
  }, [isManageSection]);

  useEffect(() => {
    const wasCompleted = wasManageTourCompletedRef.current;
    const isCompleted = tourStatus?.completedManageTour;
    if (wasCompleted === true && isCompleted === false) {
      setTourDismissed(false);
    }
    wasManageTourCompletedRef.current = isCompleted;
  }, [tourStatus?.completedManageTour]);

  const handleEnd = useCallback(() => {
    setTourDismissed(true);
    setTourActive(false);
    utils.user.getTourStatus.setData(undefined, {
      completedManageTour: true,
      completedBoardTour: tourStatus?.completedBoardTour ?? false,
    });
    completeTour({ tour: "manage" });
    // Wherever the tour wandered to, put the user back on the manage home rather
    // than leaving them on the last step's page.
    if (!isManageHome) {
      router.push("/manage");
    }
  }, [completeTour, isManageHome, router, tourStatus?.completedBoardTour, utils.user.getTourStatus]);

  const steps = useMemo(() => {
    // `enabled` mirrors the condition under which each step's TourTarget is
    // actually rendered by its page. Filtering statically (rather than skipping
    // at runtime) keeps the "n / total" counter in the popover honest.
    const allSteps: (OnboardingTourStep & { enabled?: boolean })[] = [
      {
        id: "manage-welcome",
        title: t("welcome.title"),
        content: (
          <TourStepContent
            description={t("welcome.description")}
            documentationHref={createDocumentationLink("/docs/management/boards")}
          />
        ),
      },
      {
        id: "manage-boards-list",
        title: t("boardsList.title"),
        content: (
          <TourStepContent
            description={t("boardsList.description")}
            documentationHref={createDocumentationLink("/docs/management/boards")}
            icon={<IconLayoutDashboardFilled size={18} />}
          />
        ),
      },
      {
        id: "manage-boards-create",
        title: t("boardsCreate.title"),
        enabled: capabilities.canCreateBoards,
        content: (
          <TourStepContent
            description={t("boardsCreate.description")}
            documentationHref={createDocumentationLink("/docs/management/boards")}
            icon={<IconPlus size={18} />}
          />
        ),
      },
      {
        id: "manage-apps-list",
        title: t("appsList.title"),
        enabled: capabilities.canSeeApps,
        content: (
          <TourStepContent
            description={t("appsList.description")}
            documentationHref={createDocumentationLink("/docs/management/apps")}
            icon={<IconAppsFilled size={18} />}
          />
        ),
      },
      {
        id: "manage-apps-create",
        title: t("appsCreate.title"),
        enabled: capabilities.canSeeApps && capabilities.canCreateApps,
        content: (
          <TourStepContent
            description={t("appsCreate.description")}
            documentationHref={createDocumentationLink("/docs/management/apps")}
            icon={<IconPlus size={18} />}
          />
        ),
      },
      {
        id: "manage-integrations-list",
        title: t("integrationsList.title"),
        enabled: capabilities.canSeeIntegrations,
        content: (
          <TourStepContent
            description={t("integrationsList.description")}
            documentationHref={createDocumentationLink("/docs/management/integrations")}
            icon={<IconAffiliateFilled size={18} />}
          />
        ),
      },
      {
        id: "manage-integrations-create",
        title: t("integrationsCreate.title"),
        enabled: capabilities.canSeeIntegrations && capabilities.canCreateIntegrations,
        content: (
          <TourStepContent
            description={t("integrationsCreate.description")}
            documentationHref={createDocumentationLink("/docs/management/integrations")}
            icon={<IconPlus size={18} />}
          />
        ),
      },
      {
        id: "manage-users-list",
        title: t("usersList.title"),
        // users/page.tsx gates on other-manage-users, not on admin: a non-admin
        // delegate with that permission belongs on this step.
        enabled: capabilities.canManageUsers,
        content: (
          <TourStepContent
            description={t("usersList.description")}
            documentationHref={createDocumentationLink("/docs/management/users")}
            icon={<IconUserFilled size={18} />}
          />
        ),
      },
      {
        id: "manage-users-create",
        title: t("usersCreate.title"),
        // The create button only renders when the credentials provider is on, so
        // on an SSO-only deployment this step has no target at all.
        enabled: capabilities.canManageUsers && capabilities.credentialsEnabled,
        content: (
          <TourStepContent
            description={t("usersCreate.description")}
            documentationHref={createDocumentationLink("/docs/management/users")}
            icon={<IconPlus size={18} />}
          />
        ),
      },
    ];

    return allSteps.filter((step) => step.enabled !== false) as OnboardingTourStep[];
  }, [capabilities, t]);

  return (
    <TourShell
      steps={steps}
      started={tourActive}
      onEnd={handleEnd}
      stepRoutes={stepRoutes}
      position={{ base: "bottom", sm: "right" }}
    >
      {children}
    </TourShell>
  );
};
