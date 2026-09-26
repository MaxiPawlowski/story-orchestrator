import { testModel } from "../../test/support/modelCallHost";
import { parseStoryV2OrThrow, type EngineState } from "@engine/index";
import type { ExpansionCacheEntry, ExpansionRuntimeState } from "@generation/index";
import { defaultJudgeSettings, type JudgeSettings, type SceneReadRecord } from "@judge/index";
import { ExpansionCoordinator } from "./coordinators/expansionCoordinator";
import { JudgeRuntime } from "./judge";
import { testOwnership } from "../../test/findings/testOwnership";

jest.mock("@services/STAPI", () => ({
  settingsAreLoaded: () => true,
  settingsReady: async () => {},
  observeNextSave: async () => ({ requested: true, status: 200, ok: true, timedOut: false }),
  readServerBoundary: async () => null, getPlayerName: () => "Max", sendConnectionProfileRequest: jest.fn() }));

const gate = { q: "done", op: "==", v: true };
const RAW = {
  format: 2,
  id: "lookahead",
  title: "Lookahead",
  description: "v2.2 plan 07 fixture: a stub off the active checkpoint and one off the next.",
  qualities: [{ key: "done", type: "bool", source: "extractor", rubric: "Done?" }],
  checkpoints: [
    { id: "a", name: "A", objective: "Start.", type: "anchor", start: true },
    { id: "s0", name: "S0", objective: "Bridge.", type: "intermediate" },
    { id: "b", name: "B", objective: "Middle.", type: "anchor" },
    { id: "s1", name: "S1", objective: "Bridge.", type: "intermediate" },
    { id: "c", name: "C", objective: "End.", type: "anchor" },
  ],
  transitions: [
    { from: "a", to: "s0", priority: 1, gate },
    { from: "s0", to: "b", priority: 1, gate },
    { from: "b", to: "s1", priority: 1, gate },
    { from: "s1", to: "c", priority: 1, gate },
  ],
  roster: [],
};
const story = parseStoryV2OrThrow(RAW);

const scene = (p: number, hops = 1): SceneReadRecord => ({ at: "2026-09-19T00:00:00.000Z", boundary: 2, messageId: 4, model: "jev-1.13.0", headingTo: [{ id: "b", name: "B", p, hops }], facts: { location: null, time: null, present: [], headingTo: ["B"] } });

const setup = (options: { lookahead?: boolean; scene?: SceneReadRecord | null; entries?: Record<string, ExpansionCacheEntry>; refusing?: boolean } = {}) => {
  const settings: JudgeSettings = { ...defaultJudgeSettings(), enabled: true, uses: { ...defaultJudgeSettings().uses, lookahead: true, expansionLookahead: options.lookahead ?? true } };
  const judge = new JudgeRuntime({ getSettings: () => settings, transport: jest.fn(), status: async () => ({ configured: true }), record: () => undefined, context: () => ({ boundary: 0, messageId: 0 }) });
  const expansion: ExpansionRuntimeState = { entries: { ...(options.entries ?? {}) }, scheduler: { queueDepth: 0, inFlight: false, lastError: null } };
  const scheduled: string[] = [];
  const replaced: unknown[] = [];
  let persisted = 0;
  const coordinator = new ExpansionCoordinator({ ownership: testOwnership(),
    getStory: () => story,
    getStoryRaw: () => RAW,
    getState: () => ({ activeCheckpointId: "a", blackboard: { values: {}, versions: {}, latched: {} } }) as unknown as EngineState,
    getExpansion: () => expansion,
    model: testModel("p1"),
    getCanon: () => "",
    getFactTexts: () => [],
    replaceStory: (next) => { replaced.push(next); },
    setStatus: () => undefined,
    persist: async () => { await new Promise((resolve) => setTimeout(resolve, 0)); persisted += 1; },
    notify: () => undefined,
    judge: () => judge,
    getSceneRead: () => ("scene" in options ? options.scene ?? null : scene(0.8)),
    refusing: () => options.refusing ?? false,
  });
  return { coordinator, expansion, scheduled, replaced, persisted: () => persisted, schedule: (reason: string) => { scheduled.push(reason); } };
};

const entry = (key: string, patch: Partial<ExpansionCacheEntry>): ExpansionCacheEntry => ({
  key, status: "inserted", sourceCheckpointId: key.split("->")[0], stubId: key.split("->")[1], targetAnchorId: key.split("->")[2], basis: {}, blackboardVersionSum: 0, beats: [], needsReview: false, verdicts: [], codeCheck: null, insertedCheckpointIds: [], lastError: null, attempts: 1, updatedAt: "", ...patch,
});

describe("look-ahead pre-generation (v2.2 plan 07)", () => {
  it("queues the active stub, then one stub one hop ahead where play is heading", () => {
    const env = setup();
    expect(env.coordinator.scheduleForActive(env.schedule)).toBe(true);
    expect(env.scheduled).toEqual(["expand:s0", "expand:ahead:s1"]);
    expect(env.expansion.entries["a->s0->b"]).toMatchObject({ origin: "active", status: "queued" });
    expect(env.expansion.entries["b->s1->c"]).toMatchObject({ origin: "lookahead", headingP: 0.8, status: "queued" });
  });

  it("does nothing ahead with the usage off, without a scene read, under 0.7, or two hops out", () => {
    for (const options of [{ lookahead: false }, { scene: null }, { scene: scene(0.6) }, { scene: scene(0.9, 2) }]) {
      const env = setup(options);
      env.coordinator.scheduleForActive(env.schedule);
      expect(env.scheduled).toEqual(["expand:s0"]);
    }
  });

  it("keeps one pre-generation in flight at most", () => {
    const env = setup({ entries: { "x->y->z": entry("x->y->z", { origin: "lookahead", status: "generating" }) } });
    env.coordinator.scheduleForActive(env.schedule);
    expect(env.scheduled).toEqual(["expand:s0"]);
  });

  it("re-queues a stale or failed look-ahead on arrival, capped at two attempts, and never an active one", () => {
    const at = (entries: Record<string, ExpansionCacheEntry>) => {
      const env = setup({ lookahead: false, entries });
      return { queued: env.coordinator.scheduleForActive(env.schedule), entry: env.expansion.entries["a->s0->b"] };
    };
    expect(at({ "a->s0->b": entry("a->s0->b", { origin: "lookahead", status: "stale", attempts: 1 }) })).toMatchObject({ queued: true, entry: { origin: "active", status: "queued", attempts: 1 } });
    expect(at({ "a->s0->b": entry("a->s0->b", { origin: "lookahead", status: "failed", attempts: 2 }) }).queued).toBe(false);
    expect(at({ "a->s0->b": entry("a->s0->b", { origin: "active", status: "stale" }) }).queued).toBe(false);
    expect(at({ "a->s0->b": entry("a->s0->b", { origin: "lookahead", status: "inserted" }) }).queued).toBe(false);
  });
});

// V13 (C4 precedence): the look-ahead's heading one hop out is an exit of the active checkpoint, and
// while the player refuses those exits, pre-generating one narrates them arriving where they refused.
describe("V13: the agency refusal outranks the look-ahead", () => {
  it("pre-generates nothing ahead while the player is refusing, and still queues the active stub", () => {
    const env = setup({ refusing: true });
    env.coordinator.scheduleForActive(env.schedule);
    expect(env.scheduled).toEqual(["expand:s0"]);
  });

  it("control: the same heading is pre-generated when nothing is refused", () => {
    const env = setup({ refusing: false });
    env.coordinator.scheduleForActive(env.schedule);
    expect(env.scheduled).toEqual(["expand:s0", "expand:ahead:s1"]);
  });
});

// V13: `validated` -> `inserted` was untested, and its persist was fired with `void`.
describe("V13: the boundary promotes a validated chain", () => {
  const beats = [
    { id: "0", objective: "Cross the bridge", guidance: "g", tension_target: "tense" as const, outcomes: [{ id: "0:0", label: "go", gate, deltas: [], progress: { anchor: "b", amount: 1 } }] },
    { id: "1", objective: "Reach the gate", guidance: "g", tension_target: "tense" as const, outcomes: [{ id: "1:0", label: "arrive", gate, deltas: [] }] },
  ];

  it("promotes only validated entries, rebuilds the merged story, and awaits the persist", async () => {
    const env = setup({ lookahead: false, entries: { "a->s0->b": entry("a->s0->b", { status: "validated", contract: 2, beats }), "b->s1->c": entry("b->s1->c", { status: "needs_review", contract: 2, beats: [] }) } });
    await expect(env.coordinator.commitValidated()).resolves.toBe(true);
    expect(env.persisted()).toBe(1);
    expect(env.expansion.entries["a->s0->b"].status).toBe("inserted");
    expect(env.expansion.entries["b->s1->c"].status).toBe("needs_review");
    const merged = env.replaced.at(-1) as { checkpointById: Record<string, unknown> } | undefined;
    expect(Object.keys(merged?.checkpointById ?? {})).toEqual(expect.arrayContaining(["gen_s0_1", "gen_s0_2"]));
  });

  it("control: with nothing validated it changes nothing and writes nothing", async () => {
    const env = setup({ lookahead: false, entries: { "a->s0->b": entry("a->s0->b", { status: "inserted", contract: 2, beats }) } });
    await expect(env.coordinator.commitValidated()).resolves.toBe(false);
    expect(env.persisted()).toBe(0);
    expect(env.replaced).toEqual([]);
  });
});
