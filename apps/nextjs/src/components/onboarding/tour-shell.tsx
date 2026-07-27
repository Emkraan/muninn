"use client";

import type { PropsWithChildren } from "react";
import { useCallback, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import type { OnboardingTourController, OnboardingTourStep } from "@gfazioli/mantine-onboarding-tour";
import { OnboardingTour } from "@gfazioli/mantine-onboarding-tour";
import { Button, Center, Group, Image, Kbd, Text } from "@mantine/core";
import type { FloatingPosition } from "@mantine/core";

import { useI18n } from "@homarr/translation/client";

import { muninnLogoPath } from "~/components/layout/logo/muninn-logo";

interface TourShellProps extends PropsWithChildren {
  steps: OnboardingTourStep[];
  started: boolean;
  onEnd: () => void;
  stepRoutes?: Record<string, string>;
  position?: FloatingPosition | Record<string, FloatingPosition>;
}

type TourController = OnboardingTourController;

// The library renders the popover from the mounted OnboardingTour.Target whose
// id matches the current step. When no such target exists it still keeps the
// tour "active" and still paints the full-screen dimming overlay, but there is
// no popover and therefore no Next, Done or Skip: the user is left staring at a
// greyed-out, click-blocked page, and onOnboardingTourEnd never fires so the
// tour re-arms on the next visit. Everything below exists to make sure a step
// without a live target is never the resting state.
const hasTarget = (targetId: string) => document.querySelector(`[data-tour-target="${targetId}"]`) !== null;

// The library's cutout measurement gives up 1500ms after a step becomes active,
// so a target that shows up later than that gets a popover with no hole punched
// for it. Stay well inside that budget.
const TARGET_POLL_TIMEOUT_MS = 1200;

interface PollHandle {
  cancel: () => void;
}

const pollForElement = (targetId: string, onFound: () => void, onTimeout: () => void): PollHandle => {
  let settled = false;
  const finish = (callback: () => void) => {
    if (settled) return;
    settled = true;
    clearInterval(interval);
    clearTimeout(timeout);
    callback();
  };

  const interval = setInterval(() => {
    if (hasTarget(targetId)) finish(onFound);
  }, 50);
  const timeout = setTimeout(() => finish(onTimeout), TARGET_POLL_TIMEOUT_MS);

  return {
    cancel: () => {
      settled = true;
      clearInterval(interval);
      clearTimeout(timeout);
    },
  };
};

const isTypingTarget = (target: EventTarget | null) => {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target.isContentEditable;
};

interface TourForwardButtonProps {
  label: string;
  onClick: () => void;
}

const TourForwardButton = ({ label, onClick }: TourForwardButtonProps) => {
  return (
    <Button size="sm" variant="light" onClick={onClick} rightSection={<Kbd size="xs">↵</Kbd>}>
      {label}
    </Button>
  );
};

interface TourDoneButtonProps {
  label: string;
  onClick: () => void;
}

const TourDoneButton = ({ label, onClick }: TourDoneButtonProps) => {
  return (
    <Button size="sm" onClick={onClick} rightSection={<Kbd size="xs">↵</Kbd>}>
      {label}
    </Button>
  );
};

export const TourShell = ({ steps, started, onEnd, stepRoutes, position, children }: TourShellProps) => {
  const t = useI18n();
  const router = useRouter();
  const forwardActionRef = useRef<(() => void) | null>(null);
  const endTourRef = useRef<(() => void) | null>(null);
  const pollRef = useRef<PollHandle | null>(null);
  // The library hands the controller to render props only. Stash it so the
  // keyboard handler and the watchdog can drive the tour too.
  const controllerRef = useRef<TourController | null>(null);

  const cancelPendingPoll = useCallback(() => {
    pollRef.current?.cancel();
    pollRef.current = null;
  }, []);

  // Walk the step list in `direction` from `fromIndex` and settle on the first
  // candidate whose target is actually reachable, navigating between routes as
  // needed. Running out of candidates going forward ends the tour cleanly, which
  // is what guarantees onEnd (and its completion write + redirect) always runs.
  const resolveAndGo = useCallback(
    (controller: TourController, fromIndex: number, direction: 1 | -1) => {
      cancelPendingPoll();

      const currentRoute = stepRoutes?.[controller.tour[fromIndex]?.id ?? ""];

      const attempt = (index: number) => {
        const candidate = controller.tour[index];
        if (!candidate) {
          // No candidate left. Forward means the tour is over; backward means we
          // are already at the first reachable step, so stay put. Never call
          // prevStep() at index 0 - the library ends the tour there.
          if (direction === 1) controller.endTour();
          return;
        }

        const goToCandidate = () => controller.setCurrentStepIndex(index);
        const candidateRoute = stepRoutes?.[candidate.id];

        if (!candidateRoute || candidateRoute === currentRoute) {
          if (hasTarget(candidate.id)) {
            goToCandidate();
            return;
          }
          // Same route and still no target: this step does not apply here.
          attempt(index + direction);
          return;
        }

        router.push(candidateRoute);
        pollRef.current = pollForElement(
          candidate.id,
          () => {
            pollRef.current = null;
            goToCandidate();
          },
          () => {
            pollRef.current = null;
            attempt(index + direction);
          },
        );
      };

      attempt(fromIndex + direction);
    },
    [cancelPendingPoll, router, stepRoutes],
  );

  useEffect(() => cancelPendingPoll, [cancelPendingPoll]);

  useEffect(() => {
    if (!started) {
      forwardActionRef.current = null;
      endTourRef.current = null;
      cancelPendingPoll();
      return;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (isTypingTarget(event.target)) return;

      if (event.key === "Escape") {
        // The Skip button lives inside the popover, so without this an
        // overlay-only state would have no way out at all. endTourRef is only
        // populated by a popover render, so fall back to onEnd: both providers
        // clear their own `started` state in it, which tears the overlay down.
        event.preventDefault();
        (endTourRef.current ?? onEnd)();
        return;
      }

      if (event.key !== "Enter" || event.shiftKey || event.ctrlKey || event.metaKey || event.altKey) return;
      // preventDefault stays inside the guard: it used to run first and swallow
      // Enter on every button and link in the app while a tour was armed.
      if (!forwardActionRef.current) return;
      event.preventDefault();
      forwardActionRef.current();
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [started, cancelPendingPoll, onEnd]);

  return (
    <OnboardingTour
      tour={steps}
      started={started}
      onOnboardingTourEnd={onEnd}
      onOnboardingTourChange={(step) => {
        // Watchdog for the steps resolveAndGo did not choose: the very first
        // step when the tour arms, and any step reached by the library itself.
        // If its target is not mounted, wait briefly for a render still in
        // flight and otherwise resolve forward, so a popover-less overlay is
        // never the resting state.
        if (!step) return;
        const stepIndex = steps.findIndex((candidate) => candidate.id === step.id);
        if (stepIndex === -1 || hasTarget(step.id)) return;
        cancelPendingPoll();
        pollRef.current = pollForElement(
          step.id,
          () => {
            pollRef.current = null;
          },
          () => {
            pollRef.current = null;
            if (hasTarget(step.id)) return;
            const controller = controllerRef.current;
            // No controller means no popover has ever rendered, so there is
            // nothing to advance to. End instead of leaving a bare overlay.
            if (!controller) {
              onEnd();
              return;
            }
            resolveAndGo(controller, stepIndex, 1);
          },
        );
      }}
      withStepper={false}
      header={(controller) => {
        controllerRef.current = controller;
        return (
          <>
            <Group justify="center" gap={4} py={4}>
              <Text size="sm" fw={600}>
                {(controller.currentStepIndex ?? 0) + 1}
              </Text>
              <Text size="sm" c="dimmed">
                /
              </Text>
              <Text size="sm" c="dimmed">
                {controller.tour.length}
              </Text>
            </Group>
            {(controller.currentStepIndex ?? 0) === 0 && (
              <Center py="xs">
                <Image src={muninnLogoPath} alt="Muninn" w={64} h={64} fit="contain" />
              </Center>
            )}
          </>
        );
      }}
      nextStepNavigation={(controller) => {
        const action = () => resolveAndGo(controller, controller.currentStepIndex ?? 0, 1);
        forwardActionRef.current = action;
        endTourRef.current = () => controller.endTour();
        return <TourForwardButton label={t("onboardingTour.next")} onClick={action} />;
      }}
      endStepNavigation={(controller) => {
        const action = () => controller.endTour();
        forwardActionRef.current = action;
        endTourRef.current = action;
        return <TourDoneButton label={t("onboardingTour.done")} onClick={action} />;
      }}
      prevStepNavigation={(controller) => (
        <Button
          size="sm"
          variant="default"
          onClick={() => resolveAndGo(controller, controller.currentStepIndex ?? 0, -1)}
        >
          {t("onboardingTour.prev")}
        </Button>
      )}
      skipNavigation={(controller) => (
        <Button size="sm" variant="subtle" color="gray" onClick={() => controller.skipTour()}>
          {t("onboardingTour.skip")}
        </Button>
      )}
      withPrevButton
      focusRevealProps={{
        disableTargetInteraction: true,
        popoverProps: {
          position: position ?? { base: "bottom", sm: "right" },
          width: 420,
          shadow: "xl",
          radius: "lg",
          middlewares: { shift: { padding: 16 }, flip: true },
        },
      }}
      cutoutPadding={12}
      cutoutRadius={12}
    >
      {children}
    </OnboardingTour>
  );
};
