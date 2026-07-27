"use client";

import type { PropsWithChildren } from "react";
import { useCallback, useMemo, useState } from "react";
import type { OnboardingTourStep } from "@gfazioli/mantine-onboarding-tour";
import { useMediaQuery } from "@mantine/hooks";

import { clientApi } from "@homarr/api/client";
import { useRequiredBoard } from "@homarr/boards/context";
import { createDocumentationLink } from "@homarr/definitions";
import { useScopedI18n } from "@homarr/translation/client";

import { useBoardPermissions } from "~/components/board/permissions/client";
import { TourShell } from "./tour-shell";
import { TourStepContent } from "./tour-step-content";

export const BoardTourProvider = ({ children }: PropsWithChildren) => {
  const t = useScopedI18n("onboardingTour.board");
  const board = useRequiredBoard();
  const { hasChangeAccess } = useBoardPermissions(board);
  const utils = clientApi.useUtils();
  const isMobile = useMediaQuery("(max-width: 48em)");
  // Latch, mirroring the manage tour. getTourStatus has staleTime 0 and refetches
  // on window focus, so without this a refocus (or a failed completeTour) flips
  // `started` back to true and the library restarts the tour from step 0.
  const [tourDismissed, setTourDismissed] = useState(false);
  const { data: tourStatus } = clientApi.user.getTourStatus.useQuery();
  const { mutate: completeTour } = clientApi.user.completeTour.useMutation({
    onSuccess() {
      void utils.user.getTourStatus.invalidate();
    },
    onError() {
      utils.user.getTourStatus.setData(undefined, {
        completedManageTour: tourStatus?.completedManageTour ?? false,
        completedBoardTour: false,
      });
    },
  });

  // The first step targets the desktop search input, which is display:none below
  // the sm breakpoint, so on mobile the tour would arm against a target that can
  // never come into view.
  const started = tourStatus !== undefined && !tourStatus.completedBoardTour && !tourDismissed && isMobile === false;

  const handleEnd = useCallback(() => {
    setTourDismissed(true);
    utils.user.getTourStatus.setData(undefined, {
      completedManageTour: tourStatus?.completedManageTour ?? false,
      completedBoardTour: true,
    });
    completeTour({ tour: "board" });
  }, [completeTour, tourStatus?.completedManageTour, utils.user.getTourStatus]);

  const steps = useMemo(() => {
    const allSteps: (OnboardingTourStep & { requiresChangeAccess?: boolean })[] = [
      {
        id: "board-search",
        title: t("welcome.title"),
        content: (
          <TourStepContent
            description={t("welcome.description")}
            documentationHref={createDocumentationLink(
              "/docs/getting-started/after-the-installation",
              "#creating-your-first-board",
            )}
          />
        ),
      },
      {
        id: "board-edit-mode",
        title: t("editMode.title"),
        requiresChangeAccess: true,
        content: (
          <TourStepContent
            description={t("editMode.description")}
            documentationHref={createDocumentationLink(
              "/docs/getting-started/after-the-installation",
              "#arrange-and-organize-your-board",
            )}
          />
        ),
      },
      {
        id: "board-settings",
        title: t("settings.title"),
        requiresChangeAccess: true,
        content: (
          <TourStepContent
            description={t("settings.description")}
            documentationHref={createDocumentationLink("/docs/management/boards")}
          />
        ),
      },
      {
        id: "board-switcher",
        title: t("switcher.title"),
        content: (
          <TourStepContent
            description={t("switcher.description")}
            documentationHref={createDocumentationLink("/docs/management/boards")}
          />
        ),
      },
      {
        id: "board-user-menu",
        title: t("userMenu.title"),
        content: (
          <TourStepContent
            description={t("userMenu.description")}
            documentationHref={createDocumentationLink("/docs/management/users")}
          />
        ),
      },
    ];

    return allSteps.filter((step) => !step.requiresChangeAccess || hasChangeAccess) as OnboardingTourStep[];
  }, [hasChangeAccess, t]);

  return (
    <TourShell steps={steps} started={started} onEnd={handleEnd} position={{ base: "bottom", sm: "left" }}>
      {children}
    </TourShell>
  );
};
