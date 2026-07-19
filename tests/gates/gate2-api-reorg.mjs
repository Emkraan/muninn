// tests/gates/gate2-api-reorg.mjs
//
// GATE 2 - API-only full board reorganization, zero UI.
//
// This is the direct regression test against the Homarr drag-drop failure:
// a complete board reorg (rename every section, move every item to a DIFFERENT
// section AND change its order, add a new section) must be doable purely over
// the REST API, and the whole item move must be ONE bulk call
// (PATCH /boards/:id/items/positions).
//
// Items are `ping` widgets pointed at the instance's own /api/v1/health, so the
// gate is self-contained with no link/collection dependency (the contract
// explicitly allows widget-only items to avoid a link dependency).

import {
  api,
  reporter,
  assert,
  config,
  requireEnv,
  isMain,
  printResult,
} from "./lib.mjs";

export default async function gate2() {
  const r = reporter("Gate 2 - API-only full reorg");
  r.banner();

  const token = config.userA;
  const widgetConfig = { url: `${config.url}/api/v1/health` };
  const cleanup = [];
  let err;

  try {
    requireEnv(["USER_A_TOKEN"]);
    r.info(`Target: ${config.url}`);

    // --- Create a board ---
    const board = await api("POST", "/boards", {
      token,
      body: { name: "Gate2 Reorg", description: "api-only reorg", isPublic: false },
    });
    assert(board && typeof board.id === "number", "board created with an id");
    cleanup.push(() => api("DELETE", `/boards/${board.id}`, { token }));
    r.info(`board id=${board.id}`);

    // --- Add 3 sections ---
    const mkSection = (name, order) =>
      api("POST", `/boards/${board.id}/sections`, {
        token,
        body: { name, order },
      });
    const s1 = await mkSection("Alpha", 0);
    const s2 = await mkSection("Beta", 1);
    const s3 = await mkSection("Gamma", 2);
    for (const s of [s1, s2, s3])
      assert(s && typeof s.id === "number", `section ${s?.name} has an id`);
    r.info(`sections: s1=${s1.id} s2=${s2.id} s3=${s3.id}`);

    // --- Add several widget items across the three sections ---
    const mkItem = (sectionId, order) =>
      api("POST", `/boards/${board.id}/items`, {
        token,
        body: {
          sectionId,
          kind: "widget",
          widgetType: "ping",
          widgetConfig,
          x: 0,
          y: 0,
          w: 1,
          h: 1,
          order,
        },
      });
    const i1 = await mkItem(s1.id, 0); // s1
    const i2 = await mkItem(s1.id, 1); // s1
    const i3 = await mkItem(s2.id, 0); // s2
    const i4 = await mkItem(s2.id, 1); // s2
    const i5 = await mkItem(s3.id, 0); // s3
    const items = [i1, i2, i3, i4, i5];
    for (const it of items)
      assert(it && typeof it.id === "number", "item has an id");
    r.info(`items: ${items.map((it) => it.id).join(", ")}`);

    // --- Rename EVERY section (PUT) ---
    const sectionNames = {
      [s1.id]: "Alpha [reorg]",
      [s2.id]: "Beta [reorg]",
      [s3.id]: "Gamma [reorg]",
    };
    for (const [sid, name] of Object.entries(sectionNames)) {
      await api("PUT", `/boards/${board.id}/sections/${sid}`, {
        token,
        body: { name },
      });
    }
    r.info("renamed all 3 sections");

    // --- Move EVERY item to a DIFFERENT section + change order, in ONE call ---
    // Rotate: s1->s2, s2->s3, s3->s1. New orders/positions differ from create.
    const expected = {
      [i1.id]: { sectionId: s2.id, order: 5, x: 1, y: 2, w: 2, h: 2 },
      [i2.id]: { sectionId: s2.id, order: 6, x: 2, y: 3, w: 2, h: 2 },
      [i3.id]: { sectionId: s3.id, order: 5, x: 3, y: 4, w: 2, h: 2 },
      [i4.id]: { sectionId: s3.id, order: 6, x: 4, y: 5, w: 2, h: 2 },
      [i5.id]: { sectionId: s1.id, order: 9, x: 5, y: 6, w: 2, h: 2 },
    };
    const bulkBody = {
      items: Object.entries(expected).map(([id, p]) => ({
        id: Number(id),
        ...p,
      })),
    };
    const bulkResult = await api("PATCH", `/boards/${board.id}/items/positions`, {
      token,
      body: bulkBody,
    });
    r.check(
      Array.isArray(bulkResult) && bulkResult.length === items.length,
      `single bulk PATCH updated all ${items.length} items in one call`
    );

    // --- Add one NEW section (via API) ---
    const s4 = await mkSection("Delta", 3);
    assert(s4 && typeof s4.id === "number", "new section created");
    r.info(`added new section s4=${s4.id}`);

    // --- Re-fetch the board and verify the full end state ---
    const full = await api("GET", `/boards/${board.id}`, { token });
    assert(Array.isArray(full.sections), "re-fetched board has sections[]");

    // Section count: 3 original + 1 new = 4
    r.check(
      full.sections.length === 4,
      `board now has 4 sections (got ${full.sections.length})`
    );

    // Renamed section names
    const byId = new Map(full.sections.map((s) => [s.id, s]));
    for (const [sid, name] of Object.entries(sectionNames)) {
      const s = byId.get(Number(sid));
      r.check(
        !!s && s.name === name,
        `section ${sid} renamed to "${name}" (got "${s ? s.name : "missing"}")`
      );
    }
    // New section present by name
    r.check(
      full.sections.some((s) => s.name === "Delta"),
      'new section "Delta" is present'
    );

    // Every moved item is now in its target section with the new order/geometry
    const allItems = full.sections.flatMap((s) => s.items || []);
    const itemById = new Map(allItems.map((it) => [it.id, it]));
    for (const [id, exp] of Object.entries(expected)) {
      const it = itemById.get(Number(id));
      if (!it) {
        r.fail(`item ${id} missing after reorg`);
        continue;
      }
      r.check(
        it.sectionId === exp.sectionId,
        `item ${id} moved to section ${exp.sectionId} (got ${it.sectionId})`
      );
      r.check(
        it.order === exp.order,
        `item ${id} order = ${exp.order} (got ${it.order})`
      );
      r.check(
        it.x === exp.x && it.y === exp.y && it.w === exp.w && it.h === exp.h,
        `item ${id} geometry x/y/w/h = ${exp.x}/${exp.y}/${exp.w}/${exp.h}`
      );
    }

    // Sanity: no item is still in its original section (everything actually moved)
    const origin = {
      [i1.id]: s1.id,
      [i2.id]: s1.id,
      [i3.id]: s2.id,
      [i4.id]: s2.id,
      [i5.id]: s3.id,
    };
    const stillHome = Object.entries(origin).filter(([id, sid]) => {
      const it = itemById.get(Number(id));
      return it && it.sectionId === sid;
    });
    r.check(
      stillHome.length === 0,
      "every item changed section (none left in its original section)"
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
  const res = await gate2();
  printResult(res);
  process.exit(res.ok ? 0 : 1);
}
