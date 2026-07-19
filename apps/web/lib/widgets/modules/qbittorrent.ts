import {
  WidgetModule,
  WidgetStatus,
  WidgetConfig,
  fetchWithTimeout,
  requireUrl,
  requireString,
  nowIso,
} from "../types";

function formatEta(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0 || seconds >= 8640000)
    return "∞"; // infinity
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  const s = Math.floor(seconds % 60);
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

function formatSpeed(bytesPerSec: number): string {
  if (!bytesPerSec) return "0 B/s";
  const units = ["B/s", "KB/s", "MB/s", "GB/s"];
  let v = bytesPerSec;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(1)} ${units[i]}`;
}

const qbittorrent: WidgetModule = {
  id: "qbittorrent",
  displayName: "qBittorrent",
  description: "Download queue: active torrents, progress, ETA and speed.",
  defaultRefreshIntervalSeconds: 10,
  configSchema: {
    type: "object",
    properties: {
      url: {
        type: "string",
        title: "Base URL",
        description: "e.g. http://host:8080 (WebUI address)",
      },
      username: { type: "string", title: "Username" },
      password: { type: "string", title: "Password", "x-secret": true },
      limit: { type: "number", title: "Max torrents shown", default: 8 },
    },
    required: ["url", "username", "password"],
  },
  async fetchStatus(config: WidgetConfig): Promise<WidgetStatus> {
    try {
      const url = requireUrl(config);
      const username = requireString(config, "username");
      const password = requireString(config, "password");
      const limit =
        typeof config.limit === "number" && config.limit > 0
          ? Math.floor(config.limit)
          : 8;

      // qBittorrent WebUI requires a matching Referer header, then returns a
      // SID cookie we forward to the info call (Node fetch has no cookie jar).
      const login = await fetchWithTimeout(`${url}/api/v2/auth/login`, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Referer: url,
        },
        body: new URLSearchParams({ username, password }).toString(),
      });

      if (!login.ok)
        return {
          ok: false,
          error: `Auth failed (HTTP ${login.status})`,
          fetchedAt: nowIso(),
        };

      const setCookie = login.headers.get("set-cookie") || "";
      const sidMatch = setCookie.match(/SID=([^;]+)/);
      const cookie = sidMatch ? `SID=${sidMatch[1]}` : "";

      const res = await fetchWithTimeout(
        `${url}/api/v2/torrents/info?sort=progress`,
        { headers: { Referer: url, ...(cookie ? { Cookie: cookie } : {}) } }
      );

      if (!res.ok)
        return {
          ok: false,
          error: `HTTP ${res.status}`,
          fetchedAt: nowIso(),
        };

      const torrents = (await res.json()) as Array<{
        name: string;
        progress: number;
        eta: number;
        state: string;
        dlspeed: number;
      }>;

      const downloading = torrents.filter(
        (t) => t.progress < 1 && !/paused|stopped/i.test(t.state)
      );
      const totalDown = torrents.reduce((s, t) => s + (t.dlspeed || 0), 0);

      const items = torrents.slice(0, limit).map((t) => ({
        title: t.name,
        progress: Math.round((t.progress || 0) * 100),
        subtitle:
          t.progress < 1 ? `ETA ${formatEta(t.eta)}` : "Complete",
        badge: t.state,
      }));

      return {
        ok: true,
        title: "qBittorrent",
        summary: `${downloading.length} downloading · ${formatSpeed(
          totalDown
        )}`,
        metrics: [
          { label: "Downloading", value: downloading.length },
          { label: "Total", value: torrents.length },
          { label: "Speed", value: formatSpeed(totalDown) },
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

export default qbittorrent;
