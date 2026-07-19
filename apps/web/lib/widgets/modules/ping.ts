import {
  WidgetModule,
  WidgetStatus,
  WidgetConfig,
  fetchWithTimeout,
  requireUrl,
  nowIso,
} from "../types";

// Basic per-service health indicator: HTTP reachability + latency. Matches
// Homarr's per-app "up" dot.
const ping: WidgetModule = {
  id: "ping",
  displayName: "Ping / Uptime",
  description: "HTTP reachability and latency for a single endpoint.",
  defaultRefreshIntervalSeconds: 30,
  configSchema: {
    type: "object",
    properties: {
      url: { type: "string", title: "URL to probe" },
      method: {
        type: "string",
        title: "HTTP method",
        default: "GET",
        enum: ["GET", "HEAD"],
      },
      expectedStatus: {
        type: "number",
        title: "Expected status (optional)",
        description: "If set, only this exact status counts as up.",
      },
    },
    required: ["url"],
  },
  async fetchStatus(config: WidgetConfig): Promise<WidgetStatus> {
    const started = Date.now();
    try {
      const url = requireUrl(config);
      const method =
        config.method === "HEAD" ? "HEAD" : ("GET" as "GET" | "HEAD");
      const expected =
        typeof config.expectedStatus === "number"
          ? config.expectedStatus
          : undefined;

      const res = await fetchWithTimeout(url, { method, redirect: "manual" });
      const latency = Date.now() - started;

      const up =
        expected !== undefined ? res.status === expected : res.status < 400;

      return {
        ok: up,
        title: "Uptime",
        summary: up ? `Up · ${latency} ms` : `Down · HTTP ${res.status}`,
        metrics: [
          { label: "Status", value: res.status },
          { label: "Latency", value: latency, unit: "ms" },
        ],
        error: up ? undefined : `Unexpected status ${res.status}`,
        fetchedAt: nowIso(),
      };
    } catch (e) {
      return {
        ok: false,
        title: "Uptime",
        summary: "Down · unreachable",
        error: e instanceof Error ? e.message : "Unreachable",
        metrics: [{ label: "Latency", value: Date.now() - started, unit: "ms" }],
        fetchedAt: nowIso(),
      };
    }
  },
};

export default ping;
