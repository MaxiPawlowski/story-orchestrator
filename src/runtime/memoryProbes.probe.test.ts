import { mkdirSync, writeFileSync } from "fs";
import { dirname } from "path";
import { PROBE_FLOORS, runProbeSession, summarizeProbes } from "../../test/support/memoryProbes";

describe("v3.0 41: long-horizon memory availability probes (no model, per drafted member's memory blocks)", () => {
  it("runs every probe at 20/60/150 boundaries, never shows a kept-out member the secret, and records the numbers", async () => {
    const { results } = await runProbeSession();
    const summary = summarizeProbes(results);
    const record = process.env.SO_PROBE_RECORD;
    if (record) {
      mkdirSync(dirname(record), { recursive: true });
      writeFileSync(record, `${JSON.stringify({ label: process.env.SO_PROBE_LABEL ?? "", floors: PROBE_FLOORS, ...summary, results }, null, 2)}\n`);
    }
    process.stdout.write(`${JSON.stringify({ availabilityAt60: summary.availabilityAt60, keptOutLeaks: summary.keptOutLeaks, rows: summary.rows.map((row) => `${row.kind}@${row.horizon} ${row.available}/${row.probes}`) })}\n`);
    expect(summary.total).toBe(72);
    expect(summary.keptOutLeaks).toBe(PROBE_FLOORS.keptOutLeaks);
  }, 120000);
});
