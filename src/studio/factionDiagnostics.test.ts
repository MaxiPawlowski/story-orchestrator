import type { StoryV2 } from "@engine/index";
import { runDiagnostics } from "./diagnostics";
import { readGameCall, gameOpProblem, applyGameOp } from "@copilot/agent/gameOps";

const draft = (patch: Partial<StoryV2> = {}): StoryV2 => ({
  format: 2, title: "T", description: "D", transitions: [],
  qualities: [{ key: "helped", type: "bool", source: "extractor", rubric: "Did the player help?" }],
  checkpoints: [{ id: "start", name: "Start", objective: "o", type: "anchor", start: true }],
  roster: [{ id: "mara", name: "Mara" }],
  factions: [{ id: "guild", name: "The Guild", range: [-5, 5], start: 0, bands: [{ max: 0, label: "Cold" }, { label: "Warm" }], moves: [] }],
  ...patch,
});

const codes = (story: StoryV2) => runDiagnostics(story).map((entry) => entry.code);

describe("v2.8 plan 53: faction diagnostics and the wizard tool", () => {
  it("names a faction that never moves, one the player never sees, a snapshot write and a move on inaction", () => {
    expect(codes(draft())).toContain("faction-never-moves");
    expect(codes(draft({ display: { standing: false } }))).toContain("faction-no-visible-band");
    expect(codes(draft({ checkpoints: [{ id: "start", name: "Start", objective: "o", type: "anchor", start: true, state_snapshot: { rep_guild: 3 } }] }))).toContain("faction-snapshot-key");
    const punitive = draft({ factions: [{ ...draft().factions![0], moves: [{ id: "ignored", when: { q: "helped", op: "==", v: false }, add: -1, heard_by: "present" }] }] });
    expect(runDiagnostics(punitive).find((entry) => entry.code === "faction-move-on-inaction")).toMatchObject({ severity: "blocking" });
    const fine = draft({ factions: [{ ...draft().factions![0], moves: [{ id: "helped", when: { q: "helped", op: "==", v: true }, add: 1, heard_by: "present" }] }] });
    expect(codes(fine).filter((code) => code.startsWith("faction-"))).toEqual([]);
    expect(codes(draft({ transitions: [{ from: "start", to: "start", gate: { q: "rep_guild", op: ">=", v: 2 }, priority: 1 }] }))).not.toContain("undeclared-quality");
  });

  it("a draft faction that leaves out range and start is diagnosed with the parser's defaults, not a crash", () => {
    const { range: _range, start: _start, ...bare } = draft().factions![0];
    const story = draft({ factions: [bare as NonNullable<StoryV2["factions"]>[number]] });
    expect(() => runDiagnostics(story)).not.toThrow();
    expect(codes(story)).toContain("faction-never-moves");
  });

  it("setFactions refuses a punitive move and an unknown member faction; setCharacterLife carries membership", () => {
    const refused = readGameCall("setFactions", { factions: [{ id: "guild", name: "G", bands: [{ max: 0, label: "Cold" }, { label: "Warm" }], moves: [{ id: "m", when: { not: { q: "helped", op: "==", v: true } }, add: -2 }] }] });
    expect(refused.ok).toBe(true);
    if (refused.ok) expect(gameOpProblem(draft(), refused.op)).toContain("faction-move-on-inaction");
    const member = readGameCall("setCharacterLife", { id: "mara", life: { factions: ["thieves"] } });
    expect(member.ok && gameOpProblem(draft(), member.op)).toContain("unknown faction 'thieves'");
    const joined = readGameCall("setCharacterLife", { id: "mara", life: { factions: ["guild"] } });
    expect(joined.ok && gameOpProblem(draft(), joined.op)).toBeNull();
    expect(joined.ok && applyGameOp(draft(), joined.op).roster[0].factions).toEqual(["guild"]);
    const removed = readGameCall("setFactions", { factions: [] });
    expect(removed.ok && applyGameOp(draft({ roster: [{ id: "mara", factions: ["guild"] }] }), removed.op)).toMatchObject({ roster: [{ id: "mara" }] });
    expect(removed.ok && applyGameOp(draft(), removed.op).factions).toBeUndefined();
  });
});
