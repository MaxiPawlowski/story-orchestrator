import { parseStoryV2OrThrow, type EngineState } from "@engine/index";
import type { ExpansionCacheEntry, ExpansionRuntimeState } from "@generation/index";
import { defaultJudgeSettings, type JudgeSettings, type SceneReadRecord } from "@judge/index";
import { ExpansionCoordinator } from "./coordinators/expansionCoordinator";
import { JudgeRuntime } from "./judge";

jest.mock("@services/STAPI", () => ({
  settingsAreLoaded: () => true,
  settingsReady: async () => {},
  observeNextSave: async () => ({ requested: true, status: 200, ok: true, timedOut: false }),
  readBackBoundary: () => null, getPlayerName: () => "Max", sendConnectionProfileRequest: jest.fn() }));

const gate = { q: "done", op: "==", v: true };
const story = parseStoryV2OrThrow({
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
});

const scene = (p: number, hops = 1): SceneReadRecord => ({ at: "2026-09-19T00:00:00.000Z", boundary: 2, messageId: 4, model: "jev-1.13.0", headingTo: [{ id: "b", name: "B", p, hops }], facts: { location: null, time: null, present: [], headingTo: ["B"] } });

const setup = (options: { lookahead?: boolean; scene?: SceneReadRecord | null; entries?: Record<string, ExpansionCacheEntry> } = {}) => {
  const settings: JudgeSettings = { ...defaultJudgeSettings(), enabled: true, uses: { ...defaultJudgeSettings().uses, lookahead: true, expansionLookahead: options.lookahead ?? true } };
  const judge = new JudgeRuntime({ getSettings: () => settings, transport: jest.fn(), status: async () => ({ configured: true }), record: () => undefined, context: () => ({ boundary: 0, messageId: 0 }) });
  const expansion: ExpansionRuntimeState = { entries: { ...(options.entries ?? {}) }, scheduler: { queueDepth: 0, inFlight: false, lastError: null } };
  const scheduled: string[] = [];
  const coordinator = new ExpansionCoordinator({
    getStory: () => story,
    getStoryRaw: () => ({}),
    getState: () => ({ activeCheckpointId: "a", blackboard: { values: {}, versions: {}, latched: {} } }) as unknown as EngineState,
    getExpansion: () => expansion,
    getSettings: () => ({ enabled: true, profileId: "p1", cadence: 3, reconciliationMultiplier: 1.5, stabilityLag: 0 }),
    getCanon: () => "",
    getFactTexts: () => [],
    replaceStory: () => undefined,
    setStatus: () => undefined,
    persist: async () => undefined,
    notify: () => undefined,
    judge: () => judge,
    getSceneRead: () => ("scene" in options ? options.scene ?? null : scene(0.8)),
  });
  return { coordinator, expansion, scheduled, schedule: (reason: string) => { scheduled.push(reason); } };
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
