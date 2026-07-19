import {
  WidgetModule,
  WidgetStatus,
  WidgetConfig,
  fetchWithTimeout,
  requireUrl,
  requireString,
  nowIso,
} from "../types";

const STATUS_LABELS: Record<number, string> = {
  1: "Pending",
  2: "Approved",
  3: "Declined",
};

const MEDIA_STATUS_LABELS: Record<number, string> = {
  1: "Unknown",
  2: "Pending",
  3: "Processing",
  4: "Partially available",
  5: "Available",
};

const overseerr: WidgetModule = {
  id: "overseerr",
  displayName: "Overseerr",
  description: "Media requests: pending count and the latest requests.",
  defaultRefreshIntervalSeconds: 60,
  configSchema: {
    type: "object",
    properties: {
      url: {
        type: "string",
        title: "Base URL",
        description: "e.g. https://overseerr.example.com",
      },
      apiKey: { type: "string", title: "API Key", "x-secret": true },
      limit: { type: "number", title: "Max requests shown", default: 6 },
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
          : 6;
      const headers = { "X-Api-Key": apiKey };

      const [countRes, listRes] = await Promise.all([
        fetchWithTimeout(`${url}/api/v1/request/count`, { headers }),
        fetchWithTimeout(
          `${url}/api/v1/request?take=${limit}&sort=added&filter=all`,
          { headers }
        ),
      ]);

      if (!countRes.ok || !listRes.ok)
        return {
          ok: false,
          error: `HTTP ${countRes.ok ? listRes.status : countRes.status}`,
          fetchedAt: nowIso(),
        };

      const count = (await countRes.json()) as {
        total?: number;
        pending?: number;
        approved?: number;
        available?: number;
      };
      const list = (await listRes.json()) as {
        results?: Array<{
          id: number;
          status: number;
          type: string;
          media?: { status?: number; title?: string; tmdbId?: number };
          requestedBy?: { displayName?: string; username?: string };
        }>;
      };

      const items = (list.results ?? []).map((r) => ({
        id: String(r.id),
        title:
          r.media?.title ||
          `${r.type === "tv" ? "TV" : "Movie"} · TMDB #${
            r.media?.tmdbId ?? "?"
          }`,
        subtitle:
          r.requestedBy?.displayName || r.requestedBy?.username || "Unknown",
        badge: STATUS_LABELS[r.status] || MEDIA_STATUS_LABELS[r.media?.status ?? 1],
      }));

      return {
        ok: true,
        title: "Overseerr",
        summary: `${count.pending ?? 0} pending · ${count.total ?? 0} total`,
        metrics: [
          { label: "Pending", value: count.pending ?? 0 },
          { label: "Approved", value: count.approved ?? 0 },
          { label: "Available", value: count.available ?? 0 },
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

export default overseerr;
