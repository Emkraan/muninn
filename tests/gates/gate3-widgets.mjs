// tests/gates/gate3-widgets.mjs
//
// GATE 3 - Widget render + refresh.
//
//   1. GET /widget-types lists all six built-ins, each with a configSchema.
//   2. POST /widgets/preview returns a well-formed live status (ok + fetchedAt)
//      for the configured WIDGET_TYPE / WIDGET_CONFIG.
//   3. A real board+section+widget item is polled twice ~2s apart; both replies
//      carry a fresh, advancing `fetchedAt` (proving each GET does a live fetch,
//      not a cached snapshot).
//   4. The widget type advertises a positive defaultRefreshIntervalSeconds -
//      the poll cadence the client honors.
//
// Defaults are self-contained: the `ping` widget probes the instance's own
// /api/v1/health endpoint (a live target that always exists).

import {
  api,
  reporter,
  assert,
  config,
  requireEnv,
  isMain,
  printResult,
  sleep,
  isValidDate,
} from "./lib.mjs";

const BUILTINS = [
  "qbittorrent",
  "overseerr",
  "prowlarr",
  "prom-stat",
  "ping",
  "calendar",
];

export default async function gate3() {
  const r = reporter("Gate 3 - Widget render + refresh");
  r.banner();

  const token = config.userA;
  const widgetType = process.env.WIDGET_TYPE || "ping";
  const cleanup = [];
  let err;

  try {
    requireEnv(["USER_A_TOKEN"]);
    r.info(`Target: ${config.url}`);

    let widgetConfig;
    if (process.env.WIDGET_CONFIG) {
      try {
        widgetConfig = JSON.parse(process.env.WIDGET_CONFIG);
      } catch (e) {
        throw new Error(`WIDGET_CONFIG is not valid JSON: ${e.message}`);
      }
    } else {
      widgetConfig = { url: `${config.url}/api/v1/health` };
    }
    r.info(
      `widgetType=${widgetType} widgetConfig=${JSON.stringify(widgetConfig)}`
    );

    // --- 1. Widget-type registry: all six built-ins with a config schema ---
    const types = await api("GET", "/widget-types", { token });
    assert(Array.isArray(types), "GET /widget-types returns an array");
    const byId = new Map(types.map((t) => [t.id, t]));
    for (const key of BUILTINS) {
      const t = byId.get(key);
      const okShape =
        !!t &&
        t.configSchema &&
        typeof t.configSchema === "object" &&
        Object.keys(t.configSchema).length > 0;
      r.check(okShape, `built-in "${key}" present with a configSchema`);
      if (t) r.check(t.builtin === true, `built-in "${key}" flagged builtin`);
    }

    // --- 2. Preview the configured widget config before saving ---
    const preview = await api("POST", "/widgets/preview", {
      token,
      body: { widgetType, widgetConfig },
    });
    r.check(
      preview && typeof preview.ok === "boolean",
      `preview returns an "ok" boolean (ok=${preview && preview.ok})`
    );
    r.check(
      preview && isValidDate(preview.fetchedAt),
      `preview returns a valid fetchedAt (${preview && preview.fetchedAt})`
    );
    if (preview) r.info(`preview: ok=${preview.ok} summary=${preview.summary ?? "-"}`);

    // --- 4. The type advertises a positive refresh cadence ---
    const descriptor = byId.get(widgetType);
    r.check(
      !!descriptor &&
        typeof descriptor.defaultRefreshIntervalSeconds === "number" &&
        descriptor.defaultRefreshIntervalSeconds > 0,
      `"${widgetType}" defaultRefreshIntervalSeconds is a positive number (${
        descriptor ? descriptor.defaultRefreshIntervalSeconds : "n/a"
      })`
    );

    // --- 3. Live widget item: poll widget-status twice ~2s apart ---
    const board = await api("POST", "/boards", {
      token,
      body: { name: "Gate3 Widgets", isPublic: false },
    });
    assert(board && typeof board.id === "number", "board created");
    cleanup.push(() => api("DELETE", `/boards/${board.id}`, { token }));

    const section = await api("POST", `/boards/${board.id}/sections`, {
      token,
      body: { name: "Widgets", order: 0 },
    });
    assert(section && typeof section.id === "number", "section created");

    const item = await api("POST", `/boards/${board.id}/items`, {
      token,
      body: {
        sectionId: section.id,
        kind: "widget",
        widgetType,
        widgetConfig,
        w: 1,
        h: 1,
      },
    });
    assert(item && typeof item.id === "number", "widget item created");
    r.info(`board=${board.id} section=${section.id} item=${item.id}`);

    const statusPath = `/boards/${board.id}/items/${item.id}/widget-status`;
    const status1 = await api("GET", statusPath, { token });
    await sleep(2100);
    const status2 = await api("GET", statusPath, { token });

    for (const [n, s] of [
      ["1st", status1],
      ["2nd", status2],
    ]) {
      r.check(
        s && typeof s.ok === "boolean",
        `${n} widget-status has an "ok" boolean`
      );
      r.check(
        s && isValidDate(s.fetchedAt),
        `${n} widget-status has a valid fetchedAt (${s && s.fetchedAt})`
      );
    }

    const t1 = Date.parse(status1.fetchedAt);
    const t2 = Date.parse(status2.fetchedAt);
    const now = Date.now();
    // Both timestamps are recent (fresh), and the 2nd is strictly newer than
    // the 1st -> each GET performed a live fetch rather than returning a cache.
    r.check(
      now - t1 < 120000 && now - t2 < 120000,
      "both fetchedAt values are fresh (within 2 min of now)"
    );
    r.check(
      t2 > t1,
      `2nd fetchedAt advanced past 1st (proves live re-fetch; Δ=${t2 - t1}ms)`
    );
  } catch (e) {
    err = e;
    r.fail(`unexpected error: ${e.message}`);
  } finally {
    for (const fn of cleanup.reverse()) {
      try {
        await fn();
      } catch (e) {
        r.info(`cleanup warning: ${e.message}`);
      }
    }
  }

  return r.result(err);
}

if (isMain(import.meta.url)) {
  const res = await gate3();
  printResult(res);
  process.exit(res.ok ? 0 : 1);
}
