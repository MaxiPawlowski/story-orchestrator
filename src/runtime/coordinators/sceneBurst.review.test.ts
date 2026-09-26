// v2.4 acceptance A8 (2026-09-25, J11.25). A group turn commits several boundaries within about a
// second, and `scene-read` fires once per boundary. The window is read from the live chat, so every
// one of those reads built the SAME request and all of them went out together. In the recorded runs
// (J11 run1, seriesB-run1..3) 15 of the 18 scene timeouts were such bursts of 2-4 identical requests,
// and within a burst no request after the first answered inside SCENE_TIMEOUT_MS. Every burst read
// but the last is discarded by the "chat moved past it" check anyway, and each failure aged the
// stored scene once, so one slow call marked the tracker stale and switched pre-generation off.

import type { EngineState } from "@engine/index";
import { parseStoryV2OrThrow } from "@engine/index";
import { createJudgeRuntime, defaultJudgeSettings, JudgeTimeoutError, type JudgeAnswer, type JudgeRequest, type JudgeResponse, type JudgeSettings } from "@judge/index";
import { SceneCoordinator } from "./sceneCoordinator";
import { JudgeRuntime } from "../judge";
import { mintToken, tokenMatches, type RunContext, type RunOwnership, type RunToken } from "../runToken";
import { control, finding, must } from "../../../test/findings/ledger";
import { testOwnership } from "../../../test/findings/testOwnership";

const story = parseStoryV2OrThrow({
  format: 2,
  id: "scene-burst",
  title: "Ridge Road",
  description: "A8 fixture.",
  qualities: [{ key: "reached_tower", type: "bool", source: "extractor", rubric: "At the tower?" }],
  checkpoints: [
    { id: "road", name: "The Road", objective: "Walk the ridge.", type: "anchor", start: true },
    { id: "tower", name: "The Watchtower", objective: "Reach the tower.", type: "anchor" },
  ],
  transitions: [{ from: "road", to: "tower", priority: 1, gate: { q: "reached_tower", op: "==", v: true } }],
  roster: [{ id: "arin", name: "Arin", role: "The companion" }],
});

const answers: Record<string, JudgeAnswer> = {
  time: { type: "choice", choice: "dusk", confidence: 0.9, probabilities: {} },
  "present:arin": { type: "noul", noul: 0.95 },
  "heading:tower": { type: "noul", noul: 0.93 },
};

interface Pending { request: JudgeRequest; resolve: (response: JudgeResponse) => void; reject: (error: unknown) => void }

async function flush() {
  for (let tick = 0; tick < 8; tick += 1) await Promise.resolve();
}

function harness() {
  const settings: JudgeSettings = { ...defaultJudgeSettings(), enabled: true, uses: { ...defaultJudgeSettings().uses, sceneTracker: true, lookahead: true } };
  const pending: Pending[] = [];
  const ring: Array<{ use: string; fallback?: string; cached?: boolean }> = [];
  let current: RunContext = { chatId: "chat-a", storyId: "scene-burst", playedVersion: 1, sessionEpoch: 1, windowRevision: 0, lowestMutatedMessageId: null };
  const ownership: RunOwnership = {
    mint: (window = null) => mintToken(current, window),
    check: (token: RunToken) => tokenMatches(current, token),
  };
  const judge = new JudgeRuntime({ ownership: testOwnership(),
    getSettings: () => settings,
    transport: (request) => new Promise<JudgeResponse>((resolve, reject) => { pending.push({ request, resolve, reject }); }),
    status: async () => ({ configured: true }),
    record: (record) => ring.push(record),
    context: () => ({ boundary: 1, messageId: lastMessageId }),
  });
  let lastMessageId = 61;
  let text = "We keep to the ridge road, eyes on the tower.";
  let judgeState = createJudgeRuntime();
  const scheduled: string[] = [];
  const scene = new SceneCoordinator({
    judge: () => judge,
    getStory: () => story,
    getState: () => ({ activeCheckpointId: "road", boundary: 4 }) as unknown as EngineState,
    getWindow: () => [{ speaker: "Arin", text }],
    getPlayerName: () => "Max",
    getLastMessageId: () => lastMessageId,
    getScene: () => judgeState.scene,
    setScene: (record) => { judgeState = { ...judgeState, scene: record }; },
    inject: () => ({ ok: true as const, changed: true }),
    ownership,
    now: () => Date.parse("2026-09-25T16:58:50.000Z"),
  });
  const run = (boundary: number, messageId: number) => scene.run({ boundary, messageId, heuristicFired: false, scheduleRead: (reason) => scheduled.push(reason) });
  return {
    run, pending, ring, scheduled,
    stored: () => judgeState.scene,
    seed: () => { judgeState = { ...judgeState, scene: { at: "t", boundary: 0, messageId: 57, model: "jev-1.13.0", facts: { location: null, time: "dusk", present: ["Arin"], headingTo: [] } } }; },
    answerAll: () => pending.splice(0).forEach((call) => call.resolve({ model: "jev-1.13.0", answers })),
    timeOutAll: () => pending.splice(0).forEach((call) => call.reject(new JudgeTimeoutError())),
    say: (next: string, id: number) => { text = next; lastMessageId = id; },
    switchChat: () => { current = { ...current, chatId: "chat-b", sessionEpoch: 2 }; },
  };
}

finding("ACC-A8", async () => {
  const answered = harness();
  const burst = [answered.run(1, 58), answered.run(2, 59), answered.run(3, 60), answered.run(4, 61)];
  await flush();
  must(answered.pending.length === 1, `a burst of 4 boundaries sent ${answered.pending.length} identical scene requests for one unchanged window`);
  answered.answerAll();
  await Promise.all(burst);
  must(answered.stored()?.messageId === 61 && answered.stored()?.boundary === 4, `the shared answer did not land on the current boundary: ${JSON.stringify({ boundary: answered.stored()?.boundary, messageId: answered.stored()?.messageId })}`);
  must(answered.ring.length === 1, `one scene call left ${answered.ring.length} ring rows`);

  const failed = harness();
  failed.seed();
  const slow = [failed.run(1, 58), failed.run(2, 59), failed.run(3, 60)];
  await flush();
  failed.timeOutAll();
  await Promise.all(slow);
  const failures = failed.stored()?.freshness?.failures ?? 0;
  must(failures === 1, `one timed-out scene call was counted as ${failures} failed reads, which stales the tracker and switches pre-generation off`);
});

control("A8: two different windows are two requests", async () => {
  const h = harness();
  const first = h.run(1, 60);
  await flush();
  h.say("We stop below the last switchback.", 61);
  const second = h.run(2, 61);
  await flush();
  expect(h.pending.map((call) => (call.request.state.transcript as Array<{ text: string }>)[0].text)).toEqual([
    "We keep to the ridge road, eyes on the tower.",
    "We stop below the last switchback.",
  ]);
  h.answerAll();
  await Promise.all([first, second]);
  expect(h.stored()?.messageId).toBe(61);
});

control("A8: the same read after the first one settled is asked again", async () => {
  const h = harness();
  const first = h.run(1, 61);
  await flush();
  h.answerAll();
  await first;
  await h.run(2, 61);
  expect(h.ring.map((row) => Boolean(row.cached))).toEqual([false, true]);
});

control("A8: a read in a new chat does not join the departed chat's call", async () => {
  const h = harness();
  const departed = h.run(1, 61);
  await flush();
  h.switchChat();
  const fresh = h.run(1, 61);
  await flush();
  expect(h.pending).toHaveLength(2);
  h.answerAll();
  await Promise.all([departed, fresh]);
  expect(h.stored()?.messageId).toBe(61);
});

control("A8: a single failed read still ages the tracker", async () => {
  const h = harness();
  h.seed();
  const run = h.run(4, 61);
  await flush();
  h.timeOutAll();
  await run;
  expect(h.stored()?.freshness?.failures).toBe(1);
  expect(h.ring.map((row) => row.fallback)).toEqual(["timeout"]);
});
