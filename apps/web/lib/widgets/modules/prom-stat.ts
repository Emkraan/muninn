import {
  WidgetModule,
  WidgetStatus,
  WidgetConfig,
  fetchWithTimeout,
  requireUrl,
  requireString,
  optString,
  nowIso,
} from "../types";

// Generic KPI tile backed by an arbitrary PromQL instant query against any
// Prometheus-compatible endpoint. One implementation covers Grafana/Proxmox/
// Portainer-style stat tiles - the caller supplies the query and labels.
const promStat: WidgetModule = {
  id: "prom-stat",
  displayName: "Prometheus Stat",
  description: "A single KPI from an arbitrary PromQL instant query.",
  defaultRefreshIntervalSeconds: 30,
  configSchema: {
    type: "object",
    properties: {
      url: {
        type: "string",
        title: "Prometheus base URL",
        description: "e.g. https://prometheus.example.com",
      },
      query: {
        type: "string",
        title: "PromQL query",
        description: "e.g. count(up == 1)",
      },
      label: { type: "string", title: "Metric label", default: "Value" },
      unit: { type: "string", title: "Unit (optional)" },
      decimals: { type: "number", title: "Decimal places", default: 0 },
    },
    required: ["url", "query"],
  },
  async fetchStatus(config: WidgetConfig): Promise<WidgetStatus> {
    try {
      const url = requireUrl(config);
      const query = requireString(config, "query");
      const label = optString(config, "label") ?? "Value";
      const unit = optString(config, "unit");
      const decimals =
        typeof config.decimals === "number" ? Math.max(0, config.decimals) : 0;

      const res = await fetchWithTimeout(
        `${url}/api/v1/query?query=${encodeURIComponent(query)}`
      );
      if (!res.ok)
        return { ok: false, error: `HTTP ${res.status}`, fetchedAt: nowIso() };

      const body = (await res.json()) as {
        status: string;
        data?: {
          resultType: string;
          result: any;
        };
        error?: string;
      };

      if (body.status !== "success")
        return {
          ok: false,
          error: body.error || "Query failed",
          fetchedAt: nowIso(),
        };

      let raw: string | undefined;
      const data = body.data;
      if (data?.resultType === "scalar" && Array.isArray(data.result)) {
        raw = data.result[1];
      } else if (
        (data?.resultType === "vector" || data?.resultType === "matrix") &&
        Array.isArray(data.result) &&
        data.result.length > 0
      ) {
        raw = data.result[0]?.value?.[1];
      }

      if (raw === undefined)
        return {
          ok: false,
          error: "Query returned no data",
          fetchedAt: nowIso(),
        };

      const num = Number(raw);
      const value = Number.isFinite(num) ? num.toFixed(decimals) : String(raw);

      return {
        ok: true,
        title: label,
        summary: `${value}${unit ? ` ${unit}` : ""}`,
        metrics: [{ label, value, unit }],
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

export default promStat;
