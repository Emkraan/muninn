// tests/gates/gate1-isolation.mjs
//
// GATE 1 - Per-user isolation.
//
// Two independent users (USER_A, USER_B) each create a PRIVATE board and a
// PRIVATE collection with the SAME name ("IsoTest"). We then prove that:
//   - each user's GET /boards and GET /collections list ONLY their own ids and
//     never the other user's ids (identical names must not leak across owners);
//   - USER_B cannot read USER_A's board directly (GET /boards/:idOfA -> 401/404).
//
// All resources created here are cleaned up at the end.

import {
  api,
  apiRaw,
  reporter,
  assert,
  config,
  requireEnv,
  isMain,
  printResult,
} from "./lib.mjs";

export default async function gate1() {
  const r = reporter("Gate 1 - Per-user isolation");
  r.banner();

  const cleanup = [];
  let err;

  try {
    requireEnv(["USER_A_TOKEN", "USER_B_TOKEN"]);
    r.info(`Target: ${config.url}`);

    // --- USER_A: private board + private collection, both named "IsoTest" ---
    const boardA = await api("POST", "/boards", {
      token: config.userA,
      body: { name: "IsoTest", description: "gate1", isPublic: false },
    });
    assert(boardA && typeof boardA.id === "number", "USER_A board has an id");
    cleanup.push(() =>
      api("DELETE", `/boards/${boardA.id}`, { token: config.userA })
    );
    r.info(`USER_A board id=${boardA.id}`);

    const collA = await api("POST", "/collections", {
      token: config.userA,
      body: { name: "IsoTest" },
    });
    assert(collA && typeof collA.id === "number", "USER_A collection has an id");
    cleanup.push(() =>
      api("DELETE", `/collections/${collA.id}`, { token: config.userA })
    );
    r.info(`USER_A collection id=${collA.id}`);

    // --- USER_B: SAME names, independent owner ---
    const boardB = await api("POST", "/boards", {
      token: config.userB,
      body: { name: "IsoTest", description: "gate1", isPublic: false },
    });
    assert(boardB && typeof boardB.id === "number", "USER_B board has an id");
    cleanup.push(() =>
      api("DELETE", `/boards/${boardB.id}`, { token: config.userB })
    );
    r.info(`USER_B board id=${boardB.id}`);

    const collB = await api("POST", "/collections", {
      token: config.userB,
      body: { name: "IsoTest" },
    });
    assert(collB && typeof collB.id === "number", "USER_B collection has an id");
    cleanup.push(() =>
      api("DELETE", `/collections/${collB.id}`, { token: config.userB })
    );
    r.info(`USER_B collection id=${collB.id}`);

    r.check(boardA.id !== boardB.id, "the two boards have distinct ids");
    r.check(collA.id !== collB.id, "the two collections have distinct ids");

    // --- List views must be strictly owner-scoped ---
    const [aBoards, bBoards, aColls, bColls] = await Promise.all([
      api("GET", "/boards", { token: config.userA }),
      api("GET", "/boards", { token: config.userB }),
      api("GET", "/collections", { token: config.userA }),
      api("GET", "/collections", { token: config.userB }),
    ]);
    const ids = (arr) => (Array.isArray(arr) ? arr.map((x) => x.id) : []);

    r.check(
      ids(aBoards).includes(boardA.id),
      "USER_A sees own board in GET /boards"
    );
    r.check(
      !ids(aBoards).includes(boardB.id),
      "USER_A does NOT see USER_B's board in GET /boards"
    );
    r.check(
      ids(bBoards).includes(boardB.id),
      "USER_B sees own board in GET /boards"
    );
    r.check(
      !ids(bBoards).includes(boardA.id),
      "USER_B does NOT see USER_A's board in GET /boards"
    );

    r.check(
      ids(aColls).includes(collA.id),
      "USER_A sees own collection in GET /collections"
    );
    r.check(
      !ids(aColls).includes(collB.id),
      "USER_A does NOT see USER_B's collection in GET /collections"
    );
    r.check(
      ids(bColls).includes(collB.id),
      "USER_B sees own collection in GET /collections"
    );
    r.check(
      !ids(bColls).includes(collA.id),
      "USER_B does NOT see USER_A's collection in GET /collections"
    );

    // --- Direct cross-user read must be denied (401 or 404) ---
    const denied = await apiRaw("GET", `/boards/${boardA.id}`, {
      token: config.userB,
    });
    r.check(
      denied.status === 401 || denied.status === 404,
      `USER_B GET /boards/${boardA.id} is denied (got HTTP ${denied.status})`
    );

    // Sanity: the owner CAN read their own board (proves the deny above is
    // about ownership, not a broken id).
    const ownedOk = await apiRaw("GET", `/boards/${boardA.id}`, {
      token: config.userA,
    });
    r.check(
      ownedOk.status === 200,
      `USER_A can read own board (got HTTP ${ownedOk.status})`
    );
  } catch (e) {
    err = e;
    r.fail(`unexpected error: ${e.message}`);
  } finally {
    // Clean up in reverse creation order; never let a cleanup failure abort.
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
  const res = await gate1();
  printResult(res);
  process.exit(res.ok ? 0 : 1);
}
