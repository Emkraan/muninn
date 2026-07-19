// tests/gates/run-all.mjs
//
// Runs the Muninn ship-gate suite (gates 1-4) in sequence against a LIVE
// instance, prints a summary table, and exits non-zero if ANY gate fails.
//
//   node tests/gates/run-all.mjs
//
// Each gate is also standalone-runnable, e.g. `node tests/gates/gate1-isolation.mjs`.

import { printSummary } from "./lib.mjs";
import gate1 from "./gate1-isolation.mjs";
import gate2 from "./gate2-api-reorg.mjs";
import gate3 from "./gate3-widgets.mjs";
import gate4 from "./gate4-auth-admin.mjs";

const gates = [
  ["Gate 1 - Per-user isolation", gate1],
  ["Gate 2 - API-only full reorg", gate2],
  ["Gate 3 - Widget render + refresh", gate3],
  ["Gate 4 - Admin create w/ registration disabled", gate4],
];

const results = [];
for (const [name, gate] of gates) {
  try {
    results.push(await gate());
  } catch (e) {
    // A gate that throws before producing a result (e.g. a missing env var)
    // is recorded as a hard failure rather than aborting the whole suite.
    results.push({
      name,
      passed: 0,
      failed: 1,
      ok: false,
      failures: [String(e.message || e)],
      error: String(e.message || e),
    });
  }
}

const allOk = printSummary(results);
process.exit(allOk ? 0 : 1);
