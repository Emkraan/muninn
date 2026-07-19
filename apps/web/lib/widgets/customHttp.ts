import {
  WidgetStatus,
  WidgetConfig,
  fetchWithTimeout,
  nowIso,
} from "./types";

// Declarative fetch spec for admin-registered custom widget types. Runs a
// templated HTTP request and maps the JSON response into the normalized status
// shape - no arbitrary code execution, so it is safe to persist and run.
export type FetchSpec = {
  method?: "GET" | "POST" | "HEAD";
  url: string; // supports {{configKey}} substitution
  headers?: Record<string, string>; // values support {{configKey}}
  body?: string; // supports {{configKey}}
  timeoutMs?: number;
  okPath?: string; // dot-path; ok if value is truthy / "success" / true
  titlePath?: string;
  summaryPath?: string;
  metrics?: { label: string; path: string; unit?: string }[];
};

function substitute(template: string, config: WidgetConfig): string {
  return template.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, key: string) => {
    const v = config[key];
    return v === undefined || v === null ? "" : String(v);
  });
}

function dotGet(obj: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((acc, part) => {
    if (acc == null) return undefined;
    if (Array.isArray(acc)) return acc[Number(part)];
    if (typeof acc === "object") return (acc as Record<string, unknown>)[part];
    return undefined;
  }, obj);
}

export async function runCustomHttp(
  spec: FetchSpec,
  config: WidgetConfig
): Promise<WidgetStatus> {
  try {
    if (!spec || typeof spec.url !== "string")
      return { ok: false, error: "Invalid fetchSpec", fetchedAt: nowIso() };

    const url = substitute(spec.url, config);
    const headers: Record<string, string> = {};
    for (const [k, v] of Object.entries(spec.headers ?? {})) {
      headers[k] = substitute(v, config);
    }
    const init: RequestInit = { method: spec.method ?? "GET", headers };
    if (spec.body) init.body = substitute(spec.body, config);

    const res = await fetchWithTimeout(url, init, spec.timeoutMs ?? 8000);
    if (!res.ok)
      return { ok: false, error: `HTTP ${res.status}`, fetchedAt: nowIso() };

    const contentType = res.headers.get("content-type") || "";
    const json = contentType.includes("json") ? await res.json() : {};

    let ok = true;
    if (spec.okPath) {
      const v = dotGet(json, spec.okPath);
      ok = v === true || v === "success" || (!!v && v !== "false" && v !== 0);
    }

    const metrics = (spec.metrics ?? []).map((m) => ({
      label: m.label,
      value: String(dotGet(json, m.path) ?? "-"),
      unit: m.unit,
    }));

    return {
      ok,
      title: spec.titlePath
        ? String(dotGet(json, spec.titlePath) ?? "")
        : undefined,
      summary: spec.summaryPath
        ? String(dotGet(json, spec.summaryPath) ?? "")
        : undefined,
      metrics: metrics.length ? metrics : undefined,
      fetchedAt: nowIso(),
    };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Unknown error",
      fetchedAt: nowIso(),
    };
  }
}
