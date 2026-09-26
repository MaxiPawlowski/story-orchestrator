import { readWith } from "../../test/support/modelCall";
import * as fs from "node:fs";
import * as path from "node:path";
import { parseStoryV2OrThrow, type EngineState } from "@engine/index";
import { getChatWindow } from "./chatWindow";
import { planReconciliation } from "./reconcile";
import { ExtractionScheduler, type SchedulerHost } from "./scheduler";
import { runSharedRead } from "./sharedRead";
import type { TypedJudge } from "./types";

jest.mock("@services/STAPI", () => ({
  settingsAreLoaded: () => true,
  settingsReady: async () => {},
  observeNextSave: async () => ({ requested: true, status: 200, ok: true, timedOut: false }),
  readServerBoundary: async () => null, getContext: () => ({ chat: [] }) }));

const raw = JSON.parse(fs.readFileSync(path.join(process.cwd(), "test/fixtures/extractor.story.json"), "utf8")) as { qualities: Array<Record<string, unknown>> };
const story = parseStoryV2OrThrow({ ...raw, qualities: raw.qualities.map((quality) => (quality.key === "player_has_key" ? { ...quality, read_as: "choice" } : quality)) });
const state = { activeCheckpointId: "start", boundary: 3, lastMessageId: 2, blackboard: { values: {}, versions: {}, latched: {} }, visitedAnchors: [] } as unknown as EngineState;
const window = { from: 0, to: 2, messages: [{ index: 0, messageId: 0, speaker: "Mara", text: "The key is under the mat." }, { index: 1, messageId: 1, speaker: "Max", text: "I pick up the brass key." }, { index: 2, messageId: 2, speaker: "Mara", text: "Now the vault." }] };

describe("judged typed read inside the shared read (v2.2 plan 06)", () => {
  // The evidence has to be a span of the window (plan 02's R6 screening), so both lines quote it.
  const llm = 'DELTA player_has_key value=false evidence="The key is under the mat."\nDELTA location value="vault" evidence="Now the vault."';

  it("takes the judged qualities out of the LLM scope, keeps one writer per quality, and records the split", async () => {
    const judge: TypedJudge = async ({ qualities }) => ({ deltas: [{ delta: { q: "player_has_key", v: true, source: "extractor" }, evidence: "I pick up the brass key.", judge: 0.97 }], answered: qualities.map((quality) => quality.key), model: "jev-1.13.0", confidences: { player_has_key: 0.97 } });
    const { audit } = await runSharedRead({ story, state, priority: 1, reason: "cadence", window, judgeTyped: judge, ...readWith(null, { debugResponse: llm }) });
    expect(audit.scope).not.toContain("player_has_key");
    expect(audit.prompt).not.toContain("player_has_key");
    expect(audit.acceptedDeltas.map((entry) => [entry.delta.q, entry.delta.v, entry.judge])).toEqual([["player_has_key", true, 0.97], ["location", "vault", undefined]]);
    expect(audit.judged).toEqual({ keys: ["player_has_key"], model: "jev-1.13.0", confidences: { player_has_key: 0.97 } });
  });

  it("leaves a quality the judge did not settle to the LLM read, and a failing judge changes nothing", async () => {
    const unsure: TypedJudge = async () => ({ deltas: [], answered: [], model: "jev-1.13.0", confidences: {} });
    const residual = await runSharedRead({ story, state, priority: 1, reason: "cadence", window, judgeTyped: unsure, ...readWith(null, { debugResponse: llm }) });
    expect(residual.audit.scope).toContain("player_has_key");
    expect(residual.audit.acceptedDeltas.map((entry) => entry.delta.q)).toEqual(["player_has_key", "location"]);
    const broken: TypedJudge = async () => { throw new Error("down"); };
    const fallback = await runSharedRead({ story, state, priority: 1, reason: "cadence", window, judgeTyped: broken, ...readWith(null, { debugResponse: llm }) });
    expect(fallback.audit.judged).toEqual({ keys: [], model: null, confidences: {}, fallback: "error", error: "down" });
    expect(fallback.audit.scope).toContain("player_has_key");
  });
});

describe("scheduler and stall planning for the judge (v2.2 plan 06)", () => {
  it("remembers the boundary it queued a cadence read on", () => {
    const host = { getExtractionSettings: () => ({ enabled: true, profileId: null, cadence: 3, reconciliationMultiplier: 1.5, stabilityLag: 0 }), onSchedulerChange: () => undefined, getStory: () => null, getEngineState: () => null } as unknown as SchedulerHost;
    const scheduler = new ExtractionScheduler(host);
    scheduler.onBoundary(3, false, 5);
    expect(scheduler.cadenceQueuedAt(3)).toBe(true);
    expect(scheduler.cadenceQueuedAt(4)).toBe(false);
    scheduler.onBoundary(6, true, 8);
    expect(scheduler.cadenceQueuedAt(6)).toBe(false);
  });

  it("plans a stall with every unmet extractor leaf, rubric and value included, without scheduling it", () => {
    const stalled = { ...state, boundary: 12, checkpointStartedBoundary: 0, checkpointStartedMessageId: 0, lastMessageId: 20 };
    const plan = planReconciliation(story, stalled, 1.5, getChatWindow);
    expect(plan?.reason.startsWith("reconcile:")).toBe(true);
    expect(plan?.leaves.map((leaf) => [leaf.q, leaf.op, leaf.v])).toEqual(expect.arrayContaining([["player_has_key", "==", true]]));
    expect(plan?.leaves.find((leaf) => leaf.q === "player_has_key")?.rubric).toBe(story.qualityByKey.player_has_key.rubric);
  });
});
