import { parseStoryOrThrow, type BoundaryLogEntry, type EngineState, type PrimitiveValue } from "@engine/index";
import { heldSecrets, type EpistemicEntry } from "@memory/index";
import { consoleAuthorSlice, pendingProposals, stateGroupOf } from "./authorConsole";
import { blackboardRows, stateTable } from "./blackboardView";
import { boundaryDigest, lastChanges } from "./boundaryDigest";
import { gateRowText, outgoingGateRows } from "./gateReadout";
import { buildSecretGrid } from "./whoKnows";

const story = parseStoryOrThrow({
  id: "market",
  title: "Market",
  description: "",
  qualities: [
    { key: "trust", type: "int", source: "extractor", rubric: "Trust", display: { public: true, label: "Guide's trust", as: "count" } },
    { key: "debt", type: "int", source: "code", rubric: "Debt" },
  ],
  checkpoints: [
    { id: "market", name: "The Market", objective: "Meet the guide", type: "anchor", start: true },
    { id: "confession", name: "The Confession", objective: "Hear it", type: "anchor" },
  ],
  transitions: [{ from: "market", to: "confession", priority: 1, gate: { all: [{ q: "trust", op: ">=", v: 2 }, { q: "debt", op: "==", v: 0 }] } }],
  roster: [],
});

const state = (active: string, values: Record<string, PrimitiveValue>, boundary: number): EngineState => ({
  blackboard: { values, versions: {}, latched: {} } as unknown as EngineState["blackboard"],
  activeCheckpointId: active, visitedAnchors: [active], visitedPath: [active],
  boundary, checkpointStartedBoundary: 0, checkpointStartedAt: 0, checkpointStartedMessageId: 0, lastMessageId: boundary * 2, chatLength: boundary * 2 + 1,
});

const entry = (boundary: number, before: Record<string, PrimitiveValue>, after: Record<string, PrimitiveValue>, fired = false): BoundaryLogEntry => ({
  at: boundary, boundary,
  before: state("market", before, boundary - 1),
  after: state(fired ? "confession" : "market", after, boundary),
  fired: fired ? story.outgoingByCheckpoint.market[0] : null,
  source: "gate",
  context: { lastMessageId: boundary * 2, chatLength: boundary * 2 + 1 },
  queue: { applied: [{ source: "extractor", blackboardVersionSum: 0, deltas: [{ q: "trust", v: after.trust, source: "extracted" }], outcomes: [] }] as never, discarded: [] },
  evaluated: after,
});

describe("v3.0 29 author console read-models", () => {
  test("a gate reads as label, operator word and the value now, naming its destination", () => {
    const rows = outgoingGateRows(story, "market", { trust: 1, debt: 0 });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ to: "confession", toName: "The Confession", met: false });
    expect(rows[0].leaves.map((leaf) => [leaf.label, leaf.op, leaf.want, leaf.now, leaf.met])).toEqual([["Guide's trust", "≥", "2", "1", false], ["debt", "=", "0", "0", true]]);
    expect(gateRowText(rows[0])).toBe("Guide's trust ≥ 2, now 1 → The Confession");
    expect(outgoingGateRows(story, "market", { trust: 2, debt: 0 })[0].met).toBe(true);
    expect(outgoingGateRows(null, "market", {})).toEqual([]);
  });

  test("a boundary digest names each change, who wrote it, and why the story stayed or moved", () => {
    const stayed = boundaryDigest(story, entry(2, { trust: 0 }, { trust: 1, debt: 0 }));
    expect(stayed.changes).toEqual([
      { key: "debt", label: "debt", before: "unset", after: "0", by: "engine" },
      { key: "trust", label: "Guide's trust", before: "0", after: "1", by: "read" },
    ]);
    expect(stayed.fired).toBeNull();
    expect(stayed.stayedAt).toEqual({ id: "market", name: "The Market" });
    expect(stayed.gates.map((row) => row.met)).toEqual([false]);
    const moved = boundaryDigest(story, entry(3, { trust: 1, debt: 0 }, { trust: 2, debt: 0 }, true));
    expect(moved.fired).toMatchObject({ fromName: "The Market", toName: "The Confession" });
    expect(moved.gates.map((row) => [row.to, row.met])).toEqual([["confession", true]]);
  });

  test("state rows group, search and mark what changed at the latest boundary", () => {
    const log = [entry(2, {}, { trust: 1, story_day: 1 }), entry(3, { trust: 1, story_day: 1 }, { trust: 2, story_day: 1, rep_guild: 1 })];
    expect(lastChanges(log)).toEqual({ trust: { boundary: 3, messageId: 6 }, story_day: { boundary: 2, messageId: 4 }, rep_guild: { boundary: 3, messageId: 6 } });
    const slice = consoleAuthorSlice({ story, state: state("market", { trust: 2, story_day: 1, rep_guild: 1, rel_a_b_trust: 0 }, 3), boundaryLog: log, authorView: true });
    expect(slice?.keys.trust).toEqual({ label: "Guide's trust", group: "gates", changedAt: { boundary: 3, messageId: 6 } });
    expect(slice?.keys.debt.group).toBe("gates");
    const rows = blackboardRows({ blackboard: { trust: 2, story_day: 1, rep_guild: 1, rel_a_b_trust: 0 }, gateQualities: ["trust", "debt"], pendingDeltas: [] });
    const table = stateTable(rows, slice?.keys ?? {}, 3);
    expect(table.map((group) => [group.group, group.rows.map((row) => row.key)])).toEqual([
      ["gates", ["debt", "trust"]], ["life", ["rel_a_b_trust"]], ["clock", ["story_day"]], ["faction", ["rep_guild"]],
    ]);
    expect(table[0].rows.find((row) => row.key === "trust")?.fresh).toBe(true);
    expect(table.flatMap((group) => group.rows).find((row) => row.key === "story_day")?.fresh).toBe(false);
    expect(stateTable(rows, slice?.keys ?? {}, 3, "guide").flatMap((group) => group.rows.map((row) => row.key))).toEqual(["trust"]);
    expect(stateTable(rows, slice?.keys ?? {}, 3, "", "clock").flatMap((group) => group.rows.map((row) => row.key))).toEqual(["story_day"]);
  });

  test("the console slice exists only in Author view", () => {
    expect(consoleAuthorSlice({ story, state: state("market", {}, 0), boundaryLog: [], authorView: false })).toBeNull();
    expect(consoleAuthorSlice({ story: null, state: null, boundaryLog: [], authorView: true })).toBeNull();
  });

  test("key groups: clock, faction, life and compiled families; everything else is authored", () => {
    const gates = new Set(["door_open"]);
    expect(["door_open", "story_time", "cal_season", "time_reached_x", "rep_x", "mood_a", "agenda_a_1", "codex_p_x", "quest_x", "plain"].map((key) => stateGroupOf(key, gates)))
      .toEqual(["gates", "clock", "clock", "clock", "faction", "life", "life", "compiled", "compiled", "authored"]);
  });

  test("pending proposals count curator proposals with a pending op and proposed living branches", () => {
    expect(pendingProposals({
      stagecraft: { proposals: [{ ops: [{ status: "pending" }, { status: "applied" }] }, { ops: [{ status: "rejected" }] }] },
      living: { author: { proposals: [{ status: "proposed" }, { status: "applied" }] } },
    })).toEqual({ curator: 1, living: 1, total: 2 });
    expect(pendingProposals({})).toEqual({ curator: 0, living: 0, total: 0 });
  });
});

describe("v3.0 29 who-knows-what grid (Author view only)", () => {
  const knowledge = [
    { id: "h", subject: "Kel", tag: "hiding", hiddenFrom: "Bram", content: "that he carries a silver key to the old vault", messageId: 1, createdAt: 1 },
    { id: "k", subject: "Aria", tag: "knows", content: "Kel carries a silver key to the old vault", messageId: 1, createdAt: 1 },
  ] as unknown as EpistemicEntry[];
  const members = (bramOnStage: boolean) => [
    { id: "kel", name: "Kel", names: ["Kel"], onStage: true },
    { id: "aria", name: "Aria", names: ["Aria"], onStage: true },
    { id: "bram", name: "Bram", names: ["Bram"], onStage: bramOnStage },
    { id: "mira", name: "Mira", names: ["Mira"], onStage: true },
  ];

  test("knowers know, a named kept-out member is kept out, the rest were never told", () => {
    const grid = buildSecretGrid(heldSecrets(knowledge, ["Kel", "Aria", "Bram", "Mira"]), knowledge, members(false));
    expect(grid.rows).toHaveLength(1);
    expect(grid.rows[0]).toMatchObject({ id: "h", holder: "Kel", tag: "hiding" });
    expect(grid.rows[0].cells).toEqual({ kel: "knows", aria: "knows", bram: "kept-out", mira: "not-told" });
    expect(grid.alerts).toEqual([]);
  });

  test("an alert names a kept-out member who is on stage", () => {
    const grid = buildSecretGrid(heldSecrets(knowledge, ["Kel", "Aria", "Bram", "Mira"]), knowledge, members(true));
    expect(grid.alerts.map((alert) => alert.name)).toEqual(["Bram"]);
  });

  test("control: with no held secret there is no row and no alert", () => {
    const grid = buildSecretGrid(heldSecrets([knowledge[1]], ["Kel", "Aria", "Bram"]), [knowledge[1]], members(true));
    expect(grid.rows).toEqual([]);
    expect(grid.alerts).toEqual([]);
  });

  test("an unaware secret keeps its subject out and lets everyone else know", () => {
    const unaware = [{ id: "u", subject: "Bram", tag: "unaware", content: "that his brother sold the old map to the wardens", messageId: 1, createdAt: 1 }] as unknown as EpistemicEntry[];
    const grid = buildSecretGrid(heldSecrets(unaware, ["Kel", "Bram"]), unaware, members(true));
    expect(grid.rows[0].cells.bram).toBe("kept-out");
    expect(grid.rows[0].cells.kel).toBe("knows");
    expect(grid.alerts.map((alert) => alert.name)).toEqual(["Bram"]);
  });
});
