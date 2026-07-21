"use client";

// Muninn does not phone home. Upstream Homarr initialised PostHog
// against Homarr's own telemetry host (hog.homarr.dev); we deliberately do not
// ship any client analytics. Kept as a no-op so the layout call site is stable.
export const Analytics = (_props: { enabled: boolean }) => {
  return null;
};
