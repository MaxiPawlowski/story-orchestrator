import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parseStory, isValidationErrorList, type Story } from "@engine/index";
import { DIAGNOSTIC_CONSEQUENCES, runDiagnostics } from "./diagnostics";

const base: Story = {
  title: "clue", description: "",
  qualities: [{ key: "ledger_found", type: "bool", source: "extractor", rubric: "r" }, { key: "player_turns_in_checkpoint", type: "int", source: "code", rubric: "t" }],
  checkpoints: [
    { id: "dock", name: "Dock", objective: "Find the ledger.", type: "intermediate", start: true },
    { id: "office", name: "Office", objective: "", type: "anchor" },
  ],
  transitions: [{ from: "dock", to: "office", priority: 0, gate: { all: [{ q: "ledger_found", op: "==", v: true }] } }],
  roster: [],
};

const hits = (draft: Story) => runDiagnostics(draft).filter((entry) => entry.code === "one-clue-exit");
const dock = (patch: Partial<Story["checkpoints"][number]>): Story => ({ ...base, checkpoints: [{ ...base.checkpoints[0], ...patch }, base.checkpoints[1]] });

describe("v3.0 43 P1: one-clue-exit", () => {
  it("warns when every exit needs one extractor value, consequence first", () => {
    expect(hits(base)).toEqual([expect.objectContaining({ severity: "info", path: "checkpoints.0.leads", consequence: DIAGNOSTIC_CONSEQUENCES["one-clue-exit"] })]);
    expect(hits(dock({ leads: ["one lead"] }))).toHaveLength(1);
  });

  it("is silent with two or more leads, an alternate, a turn-count fallback, or an exit that needs another value", () => {
    expect(hits(dock({ leads: ["a", "b"] }))).toEqual([]);
    expect(hits(dock({ leads: ["a", "b", "c"] }))).toEqual([]);
    expect(hits(dock({ agency: { alternate: "office" } }))).toEqual([]);
    expect(hits({ ...base, transitions: [{ ...base.transitions[0], gate: { any: [{ q: "ledger_found", op: "==", v: true }, { q: "player_turns_in_checkpoint", op: ">=", v: 8 }] } }] })).toEqual([]);
    expect(hits({ ...base, qualities: [...base.qualities, { key: "clerk_talked", type: "bool", source: "extractor", rubric: "r" }],
      transitions: [...base.transitions, { from: "dock", to: "office", priority: 1, gate: { q: "clerk_talked", op: "==", v: true } }] })).toEqual([]);
  });

  it("an all-gate that needs the clue plus a turn count still needs the clue", () => {
    expect(hits({ ...base, transitions: [{ ...base.transitions[0], gate: { all: [{ q: "ledger_found", op: "==", v: true }, { q: "player_turns_in_checkpoint", op: ">=", v: 2 }] } }] })).toHaveLength(1);
  });

  it("validation keeps 1-4 trimmed leads and stuck_after 1..20, and refuses them on an open stretch", () => {
    const parsed = (patch: Record<string, unknown>) => parseStory({ ...base, id: "clue", checkpoints: [{ ...base.checkpoints[0], ...patch }, base.checkpoints[1]] });
    const ok = parsed({ leads: [" a ", "", "b"], stuck_after: 4 });
    expect(isValidationErrorList(ok) ? ok : ok.checkpoints[0]).toMatchObject({ leads: ["a", "b"], stuck_after: 4 });
    for (const bad of [{ leads: ["a", "b", "c", "d", "e"] }, { leads: "a" }, { stuck_after: 0 }, { stuck_after: 21 }, { leads: ["x".repeat(241)] }]) {
      expect(isValidationErrorList(parsed(bad))).toBe(true);
    }
    expect(isValidationErrorList(parsed({ leads: ["a"], stretch: { mode: "open", pace: "brief" } }))).toBe(true);
  });

  it("P1 baseline (informational, no target): one-clue-exit findings over the fixture stories", () => {
    const dir = join(__dirname, "../../test/fixtures");
    const drafts: Story[] = readdirSync(dir).filter((name) => name.endsWith(".story.json")).sort()
      .map((name) => JSON.parse(readFileSync(join(dir, name), "utf8").replace(/^﻿/, "")) as Story)
      .filter((draft) => Array.isArray(draft.checkpoints) && Array.isArray(draft.transitions));
    const findings = drafts.map((draft) => hits(draft).length);
    const gated = drafts.reduce((sum, draft) => sum + new Set(draft.transitions.map((transition) => transition.from)).size, 0);
    const result = { stories: drafts.length, storiesFlagged: findings.filter(Boolean).length, findings: findings.reduce((a, b) => a + b, 0), checkpointsWithExits: gated };
    process.stdout.write(`${JSON.stringify(result)}\n`);
    expect(result.findings).toBeLessThanOrEqual(result.checkpointsWithExits);
  });
});
