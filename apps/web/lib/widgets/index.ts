import { prisma } from "@linkwarden/prisma";
import type {
  WidgetModule,
  WidgetStatus,
  WidgetConfig,
  WidgetTypeDescriptor,
  JSONSchema,
} from "./types";
import { nowIso } from "./types";
import { runCustomHttp, FetchSpec } from "./customHttp";

import qbittorrent from "./modules/qbittorrent";
import overseerr from "./modules/overseerr";
import prowlarr from "./modules/prowlarr";
import promStat from "./modules/prom-stat";
import ping from "./modules/ping";
import calendar from "./modules/calendar";

// Built-in widget types, defined in code.
const BUILTINS: Record<string, WidgetModule> = {
  [qbittorrent.id]: qbittorrent,
  [overseerr.id]: overseerr,
  [prowlarr.id]: prowlarr,
  [promStat.id]: promStat,
  [ping.id]: ping,
  [calendar.id]: calendar,
};

export function getBuiltinModule(key: string): WidgetModule | undefined {
  return BUILTINS[key];
}

export function getBuiltinDescriptors(): WidgetTypeDescriptor[] {
  return Object.values(BUILTINS).map((m) => ({
    id: m.id,
    displayName: m.displayName,
    description: m.description,
    configSchema: m.configSchema,
    defaultRefreshIntervalSeconds: m.defaultRefreshIntervalSeconds,
    builtin: true,
  }));
}

// Is a widgetType key a known built-in or a registered custom type?
export async function isWidgetTypeKnown(key: string): Promise<boolean> {
  if (BUILTINS[key]) return true;
  const custom = await prisma.widgetType.findUnique({ where: { key } });
  return !!custom;
}

// Full registry (built-ins + custom) for GET /api/v1/widget-types.
export async function getAllWidgetTypeDescriptors(): Promise<
  WidgetTypeDescriptor[]
> {
  const custom = await prisma.widgetType.findMany({
    orderBy: { key: "asc" },
  });
  const customDescriptors: WidgetTypeDescriptor[] = custom.map((c) => ({
    id: c.key,
    displayName: c.displayName,
    description: c.description,
    configSchema: c.configSchema as unknown as JSONSchema,
    defaultRefreshIntervalSeconds: c.defaultRefreshIntervalSeconds,
    builtin: false,
  }));
  return [...getBuiltinDescriptors(), ...customDescriptors];
}

// Execute a widget's status fetch: dispatch to the built-in module or run the
// custom type's declarative fetch spec.
export async function fetchWidgetStatus(
  key: string,
  config: WidgetConfig
): Promise<WidgetStatus> {
  const builtin = BUILTINS[key];
  if (builtin) return builtin.fetchStatus(config ?? {});

  const custom = await prisma.widgetType.findUnique({ where: { key } });
  if (!custom)
    return { ok: false, error: "Unknown widget type.", fetchedAt: nowIso() };

  return runCustomHttp(custom.fetchSpec as unknown as FetchSpec, config ?? {});
}

export type { WidgetStatus, WidgetConfig, WidgetTypeDescriptor } from "./types";
