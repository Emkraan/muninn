import {
  WidgetModule,
  WidgetStatus,
  WidgetConfig,
  fetchWithTimeout,
  requireUrl,
  requireString,
  nowIso,
} from "../types";

const prowlarr: WidgetModule = {
  id: "prowlarr",
  displayName: "Prowlarr",
  description: "Indexer manager: enabled/failing indexers and health.",
  defaultRefreshIntervalSeconds: 120,
  configSchema: {
    type: "object",
    properties: {
      url: {
        type: "string",
        title: "Base URL",
        description: "e.g. https://prowlarr.example.com",
      },
      apiKey: { type: "string", title: "API Key", "x-secret": true },
      limit: { type: "number", title: "Max indexers shown", default: 10 },
    },
    required: ["url", "apiKey"],
  },
  async fetchStatus(config: WidgetConfig): Promise<WidgetStatus> {
    try {
      const url = requireUrl(config);
      const apiKey = requireString(config, "apiKey");
      const limit =
        typeof config.limit === "number" && config.limit > 0
          ? Math.floor(config.limit)
          : 10;
      const headers = { "X-Api-Key": apiKey };

      const [indexerRes, statusRes, healthRes] = await Promise.all([
        fetchWithTimeout(`${url}/api/v1/indexer`, { headers }),
        fetchWithTimeout(`${url}/api/v1/indexerstatus`, { headers }),
        fetchWithTimeout(`${url}/api/v1/health`, { headers }),
      ]);

      if (!indexerRes.ok)
        return {
          ok: false,
          error: `HTTP ${indexerRes.status}`,
          fetchedAt: nowIso(),
        };

      const indexers = (await indexerRes.json()) as Array<{
        id: number;
        name: string;
        enable: boolean;
      }>;
      // indexerstatus rows exist only for indexers currently in a failure state.
      const failing = indexerRes.ok && statusRes.ok
        ? ((await statusRes.json()) as Array<{ indexerId: number }>)
        : [];
      const health = healthRes.ok
        ? ((await healthRes.json()) as Array<{ type: string; message: string }>)
        : [];

      const failingIds = new Set(failing.map((f) => f.indexerId));
      const enabled = indexers.filter((i) => i.enable);

      const items = indexers.slice(0, limit).map((i) => ({
        id: String(i.id),
        title: i.name,
        badge: failingIds.has(i.id)
          ? "Failing"
          : i.enable
            ? "Enabled"
            : "Disabled",
        status: failingIds.has(i.id) ? "error" : i.enable ? "ok" : "muted",
      }));

      return {
        ok: failingIds.size === 0,
        title: "Prowlarr",
        summary: `${enabled.length}/${indexers.length} enabled${
          failingIds.size ? ` · ${failingIds.size} failing` : ""
        }`,
        metrics: [
          { label: "Enabled", value: enabled.length },
          { label: "Total", value: indexers.length },
          { label: "Failing", value: failingIds.size },
          { label: "Health issues", value: health.length },
        ],
        items,
        fetchedAt: nowIso(),
      };
    } catch (e) {
      return {
        ok: false,
        error: e instanceof Error ? e.message : "Unknown error",
        fetchedAt: nowIso(),
      };
    }
  },
};

export default prowlarr;
