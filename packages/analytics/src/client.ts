// Emkraan: Muninn does NOT send usage analytics to Homarr's telemetry host
// (upstream pointed PostHog at hog.homarr.dev). getPostHogClient returns a
// no-op stub so the analytics cron and trackEvent run but never transmit
// anything off-box. If first-party telemetry is ever wanted, point this at an
// Emkraan-owned endpoint - never Homarr's.
interface NoopAnalyticsClient {
  capture: (payload: { distinctId: string; event: string; properties?: Record<string, unknown> }) => void;
  flush: () => Promise<void>;
  shutdown: () => Promise<void>;
}

let instance: NoopAnalyticsClient | undefined;

export const getPostHogClient = (): NoopAnalyticsClient => {
  instance ??= {
    capture: () => undefined,
    flush: async () => undefined,
    shutdown: async () => undefined,
  };
  return instance;
};

export const trackEvent = (_instanceId: string, _event: string, _properties?: Record<string, unknown>) => {
  // no-op: Muninn does not phone home
};
