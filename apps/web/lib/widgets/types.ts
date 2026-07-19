// Muninn widget framework - shared contract.
//
// A widget type is a small, self-contained, agnostic server-side module. It
// declares a JSON Schema for its configuration (endpoint URLs, API keys, query
// strings - all supplied per BoardItem at runtime, never hardcoded) and a
// fetchStatus(config) that returns a normalized status payload the frontend
// renders as a compact card. Keeping the shape normalized means one card
// renderer handles every widget type.

export type JSONSchema = {
  type: "object";
  properties: Record<
    string,
    {
      type: "string" | "number" | "boolean";
      title?: string;
      description?: string;
      default?: unknown;
      // x-secret marks a field the UI should render as a password and the API
      // should never echo back in plaintext.
      "x-secret"?: boolean;
      enum?: string[];
    }
  >;
  required?: string[];
};

export type WidgetMetric = {
  label: string;
  value: string | number;
  unit?: string;
};

export type WidgetListItem = {
  id?: string;
  title: string;
  subtitle?: string;
  // 0..100 for progress-style items (e.g. torrents).
  progress?: number;
  status?: string;
  badge?: string;
  timestamp?: string;
};

// The single normalized payload every widget returns.
export type WidgetStatus = {
  ok: boolean;
  title?: string;
  summary?: string;
  metrics?: WidgetMetric[];
  items?: WidgetListItem[];
  error?: string;
  fetchedAt: string;
};

export type WidgetConfig = Record<string, unknown>;

export interface WidgetModule {
  id: string;
  displayName: string;
  description: string;
  configSchema: JSONSchema;
  defaultRefreshIntervalSeconds: number;
  fetchStatus: (config: WidgetConfig) => Promise<WidgetStatus>;
}

// A public (secret-stripped) descriptor for the widget-types registry endpoint.
export type WidgetTypeDescriptor = {
  id: string;
  displayName: string;
  description: string;
  configSchema: JSONSchema;
  defaultRefreshIntervalSeconds: number;
  builtin: boolean;
};

export function nowIso(): string {
  return new Date().toISOString();
}

// Shared helper: fetch with a timeout so a hung integration can't stall a board.
export async function fetchWithTimeout(
  url: string,
  init: RequestInit = {},
  timeoutMs = 8000
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

// Normalize a base URL (strip trailing slash) and require a non-empty string.
export function requireUrl(config: WidgetConfig, key = "url"): string {
  const raw = config[key];
  if (typeof raw !== "string" || raw.trim() === "")
    throw new Error(`Missing required "${key}" in widget config`);
  return raw.trim().replace(/\/+$/, "");
}

export function requireString(config: WidgetConfig, key: string): string {
  const raw = config[key];
  if (typeof raw !== "string" || raw.trim() === "")
    throw new Error(`Missing required "${key}" in widget config`);
  return raw.trim();
}

export function optString(config: WidgetConfig, key: string): string | undefined {
  const raw = config[key];
  return typeof raw === "string" && raw.trim() !== "" ? raw.trim() : undefined;
}
