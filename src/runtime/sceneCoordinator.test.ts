import { parseStoryV2OrThrow, type EngineState } from "@engine/index";
import { createJudgeRuntime, defaultJudgeSettings, dropJudgeCallsAfter, type JudgeAnswer, type JudgeRequest, type JudgeSettings, type SceneReadRecord } from "@judge/index";
import { reachableFrom, SceneCoordinator, SCENE_JUDGE_READ_REASON } from "./coordinators/sceneCoordinator";
import { JudgeRuntime } from "./judge";

const story = parseStoryV2OrThrow({
  format: 2,
  id: "scene-fixture",
  title: "Sun Ruins",
  description: "Scene read fixture.",
  qualities: [{ key: "location", type: "enum", values: ["guild hall", "desert road"], source: "extractor", rubric: "Where?" }],
  checkpoints: [
    { id: "cp1", name: "The Job Board", objective: "Take the job.", type: "anchor", start: true },
    { id: "cp2", name: "Leave Town", objective: "Head out.", type: "anchor" },
    { id: "cp3", name: "The Sphinx Gate", objective: "Answer the riddle.", type: "anchor" },
  ],
  transitions: [
    { from: "cp1", to: "cp2", priority: 1, gate: { q: "location", op: "==", v: "desert road" } },
    { from: "cp2", to: "cp3", priority: 1, gate: { q: "location", op: "==", v: "desert road" } },
  ],
  roster: [{ id: "arin", name: "Arin", role: "The companion" }, { id: "luke", name: "Luke" }],
});

const state = { activeCheckpointId: "cp1", boundary: 3 } as unknown as EngineState;

const answers = (breakP: number): Record<string, JudgeAnswer> => ({
  scene_break: { type: "noul", noul: breakP },
  scene_break_type: { type: "choice", choice: "time_skip", confidence: 0.8, probabilities: {} },
  location: { type: "choice", choice: "desert road", confidence: 0.9, probabilities: {} },
  time: { type: "choice", choice: "dawn", confidence: 0.85, probabilities: {} },
  "present:arin": { type: "noul", noul: 0.95 },
  "present:luke": { type: "noul", noul: 0.1 },
  "heading:cp2": { type: "noul", noul: 0.8 },
  "heading:cp3": { type: "noul", noul: 0.75 },
});

const setup = (uses: Partial<JudgeSettings["uses"]>, breakP = 0.82) => {
  const settings: JudgeSettings = { ...defaultJudgeSettings(), enabled: true, uses: { ...defaultJudgeSettings().uses, ...uses } };
  const requests: JudgeRequest[] = [];
  const calls: string[] = [];
  const judge = new JudgeRuntime({
    getSettings: () => settings,
    transport: async (request) => {
      requests.push(request);
      return { model: "jev-1.13.0", answers: Object.fromEntries(Object.entries(answers(breakP)).filter(([id]) => id in request.questions)) };
    },
    status: async () => ({ configured: true }),
    record: (record) => calls.push(`${record.use}${record.p ? `:${JSON.stringify(record.p)}` : ""}`),
    context: () => ({ boundary: 3, messageId: 9 }),
  });
  let lastMessageId = 9;
  let judgeState = createJudgeRuntime();
  const injected: Array<string | null> = [];
  const scheduled: string[] = [];
  const scene = new SceneCoordinator({
    judge: () => judge,
    getStory: () => story,
    getState: () => state,
    getWindow: () => [{ speaker: "DM Narrator", text: "You wake at dawn on the desert road." }],
    getPlayerName: () => "Max",
    getLastMessageId: () => lastMessageId,
    getScene: () => judgeState.scene,
    setScene: (record) => { judgeState = { ...judgeState, scene: record }; },
    inject: (text) => { injected.push(text); return { ok: true as const, changed: true }; },
    now: () => Date.parse("2026-09-19T00:00:00.000Z"),
  });
  const run = (heuristicFired = false) => scene.run({ boundary: 3, messageId: 9, heuristicFired, scheduleRead: (reason) => scheduled.push(reason) });
  return {
    scene, settings, requests, calls, injected, scheduled, run,
    setLastMessageId: (id: number) => { lastMessageId = id; },
    rollback: (messageId: number) => { judgeState = dropJudgeCallsAfter(judgeState, messageId); scene.sync(); },
    stored: () => judgeState.scene,
  };
};

describe("SceneCoordinator (v2.2 plan 03)", () => {
  it("is inactive, and asks nothing, with every scene usage off", async () => {
    const env = setup({});
    expect(env.scene.active()).toBe(false);
    expect(await env.run()).toBeNull();
    expect(env.requests).toEqual([]);
  });

  it("trigger only: asks the break questions, and schedules a read the heuristic did not", async () => {
    const env = setup({ sceneTrigger: true });
    await env.run();
    expect(Object.keys(env.requests[0].questions)).toEqual(["scene_break", "scene_break_type"]);
    expect(env.scheduled).toEqual([SCENE_JUDGE_READ_REASON]);
    expect(env.calls).toEqual(['scene:{"break":0.82}']);
    expect(env.injected).toEqual([]);
  });

  it("union with the regex: no second read when the heuristic already fired, none under the trigger", async () => {
    const fired = setup({ sceneTrigger: true });
    await fired.run(true);
    expect(fired.scheduled).toEqual([]);
    const quiet = setup({ sceneTrigger: true }, 0.2);
    await quiet.run();
    expect(quiet.scheduled).toEqual([]);
    expect(quiet.stored()?.sceneBreak).toEqual({ p: 0.2, type: "time_skip", triggered: false });
  });

  it("tracker: stores over-floor facts, injects the block once, and uses the enum quality as places", async () => {
    const env = setup({ sceneTracker: true });
    await env.run();
    expect(env.requests[0].state).toMatchObject({ locations: ["guild hall", "desert road"], player: "Max" });
    expect(env.stored()?.facts).toEqual({ location: "desert road", time: "dawn", present: ["Arin"], headingTo: [] });
    expect(env.injected).toEqual(["[Scene: desert road, dawn. Present: Arin.]"]);
    env.scene.sync();
    expect(env.injected).toHaveLength(1);
  });

  it("drops a read the chat moved past while it was in flight", async () => {
    const env = setup({ sceneTracker: true, sceneTrigger: true });
    env.setLastMessageId(10);
    expect(await env.run()).toBeNull();
    expect(env.stored()).toBeNull();
    expect(env.scheduled).toEqual([]);
    expect(env.injected).toEqual([]);
  });

  it("a rollback past the read clears it and the block; switching every usage off clears it too", async () => {
    const env = setup({ sceneTracker: true });
    await env.run();
    env.rollback(9);
    expect(env.stored()).toBeNull();
    expect(env.injected).toEqual(["[Scene: desert road, dawn. Present: Arin.]", null]);
    await env.run();
    env.settings.uses.sceneTracker = false;
    env.scene.sync();
    expect(env.stored()).toBeNull();
    env.scene.sync();
    expect(env.injected.at(-1)).toBeNull();
  });

  it("look-ahead asks one and two hops ahead, never the active checkpoint", async () => {
    expect(reachableFrom(story, "cp1")).toEqual([
      { id: "cp2", name: "Leave Town", objective: "Head out.", hops: 1 },
      { id: "cp3", name: "The Sphinx Gate", objective: "Answer the riddle.", hops: 2 },
    ]);
    const env = setup({ lookahead: true });
    await env.run();
    expect(Object.keys(env.requests[0].questions)).toEqual(["heading:cp2", "heading:cp3"]);
    expect(env.stored()?.headingTo).toEqual([{ id: "cp2", name: "Leave Town", p: 0.8, hops: 1 }, { id: "cp3", name: "The Sphinx Gate", p: 0.75, hops: 2 }]);
  });

  it("a story that switches the block off keeps the read but injects nothing", async () => {
    const env = setup({ sceneTracker: true });
    const withoutBlock = { ...story, scene_read: { inject: false } };
    const scene = new SceneCoordinator({ ...(env.scene as unknown as { deps: ConstructorParameters<typeof SceneCoordinator>[0] }).deps, getStory: () => withoutBlock });
    const record: SceneReadRecord | null = await scene.run({ boundary: 3, messageId: 9, heuristicFired: false, scheduleRead: () => undefined });
    expect(record?.facts.location).toBe("desert road");
    expect(env.injected).toEqual([]);
  });
});
