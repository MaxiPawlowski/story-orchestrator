jest.mock("@services/STAPI", () => ({
  settingsAreLoaded: () => true,
  settingsReady: async () => {},
  observeNextSave: async () => ({ requested: true, status: 200, ok: true, timedOut: false }),
  readServerBoundary: async () => null, setStoryExtensionPrompt: jest.fn(), clearStoryExtensionPrompt: jest.fn(), MEMORY_INJECTION_KEY_PREFIX: "so-memory-" }));

import { readFileSync } from "fs";
import { join } from "path";
import { StoryEngine, agendaStepKey, parseStoryV2OrThrow, type NormalizedStoryV2 } from "@engine/index";
import { deriveLife } from "@engine/life/derive";
import { pendingRow, restorePlan, rowsAfter, type EffectWrite } from "./effectLedger";
import { createGamePort } from "./gamePort";
import { earnedWorldInfo, worldInfoPlan } from "./worldInfoGates";
import { mintToken, tokenMatches, type RunContext, type RunOwnership } from "./runToken";
import type { EarnedEffects, EffectsApplier } from "./effectsApplier";
import type { EffectLedgerRow, EffectOrigin, LoadedStory, RuntimeExtras } from "./types";

const RAW = JSON.parse(readFileSync(join(process.cwd(), "test/fixtures/character-life.story.json"), "utf8")) as Record<string, unknown> & { roster: Array<Record<string, unknown>> };
const STORY = parseStoryV2OrThrow(RAW);

const wi = { kind: "wi" as const, book: "Life Lab", uid: 4, entry: "Smuggler paid" };
const origin = (kind: EffectOrigin["kind"], id: string, messageId: number): EffectOrigin => ({ kind, id, boundary: messageId, messageId });
const row = (before: unknown, after: unknown, messageId: number, from?: EffectOrigin): EffectLedgerRow => {
  const write: EffectWrite = {
    effect: "world_info", target: wi, before: { disable: before }, after: { disable: after }, checkpointId: from ? null : "start",
    boundary: messageId, messageId, at: "2026-10-07T00:00:00.000Z", ...(from ? { origin: from } : {}),
  };
  return { ...pendingRow(write), status: "applied" };
};
const holding = (disable: unknown) => ({ read: () => ({ disable }) });

describe("v2.7 plan 37 L3 (S-15): agenda writes share the one chronological undo", () => {
  it("undoes interleaved checkpoint, quest and agenda writes on one target newest first", () => {
    const rows = [row(true, false, 4), row(false, true, 6, origin("agenda", "arin:debt:1", 6)), row(true, false, 8, origin("quest", "bell", 8)), row(false, true, 10, origin("agenda", "arin:debt:2", 10))];
    const plan = restorePlan(rowsAfter(rows, 4), holding(true));
    expect(plan.refused).toEqual([]);
    expect(plan.steps.map((step) => step.row.messageId)).toEqual([10, 8, 6, 4]);
  });

  it("negative control: an agenda-only undo of an interleaved target is refused, not guessed", () => {
    const rows = [row(true, false, 4), row(false, true, 6, origin("agenda", "arin:debt:1", 6)), row(true, false, 8)];
    const agendaOnly = rowsAfter(rows, 4).filter((entry) => entry.origin?.kind === "agenda");
    expect(restorePlan(agendaOnly, holding(false)).refused.map((entry) => entry.status)).toEqual(["externally-changed"]);
  });
});

describe("v2.7 plan 37 L3: an agenda step's world_info is part of the path replay", () => {
  it("enables the step's entry once it landed, and the replay without it disables it again", () => {
    const landed = { [agendaStepKey("arin", "debt")]: 2 };
    const on = worldInfoPlan(STORY, ["start"], [], earnedWorldInfo(STORY, landed));
    expect(on).toEqual([{ lorebook: "Life Lab", enable: ["Smuggler paid"], disable: [] }]);
    const off = worldInfoPlan(STORY, ["start"], [], earnedWorldInfo(STORY, { [agendaStepKey("arin", "debt")]: 1 }));
    expect(off).toEqual([{ lorebook: "Life Lab", enable: [], disable: ["Smuggler paid"] }]);
  });
});

const context: RunContext = { chatId: "c1", storyId: "character-life-lab", storyHash: "h1", sessionEpoch: 1, windowRevision: 0 };
const ownership: RunOwnership = { mint: (window) => mintToken(context, window ?? null), check: (token) => tokenMatches(context, token) };

const port = (story: NormalizedStoryV2) => {
  const chat: Array<{ is_user: boolean; mes: string }> = [];
  const engine = new StoryEngine({ now: () => 0, derive: (view) => deriveLife(story, view, chat) });
  engine.loadStory(story);
  const calls: EarnedEffects[][] = [];
  const effects = { applyEarnedEffects: async (_story: unknown, earned: EarnedEffects[]) => { calls.push(earned); } } as unknown as EffectsApplier;
  const loaded = { story, record: { id: story.id } } as unknown as LoadedStory;
  const game = createGamePort({ engine, loaded: () => loaded, extras: () => ({}) as RuntimeExtras, effects: () => effects, ownership, persist: async () => {}, notify: () => {} });
  const turn = () => {
    chat.push({ is_user: true, mes: "on" }, { is_user: false, mes: "…" });
    game.onBoundary(engine.commitBoundary({ lastMessageId: chat.length - 1, chatLength: chat.length }), "c1");
  };
  return { turn, calls };
};

describe("v2.7 plan 37 L3 (F25): the boundary dispatches a landed step's effects once, tagged agenda", () => {
  it("dispatches only the step whose effect landed this boundary", async () => {
    const withReply = JSON.parse(JSON.stringify(RAW)) as typeof RAW;
    const steps = (withReply.roster[0].agenda as Array<{ steps: Array<Record<string, unknown>> }>)[0].steps;
    steps[0].effect = { npc_replies: [{ trigger: "onEnter", member: "narrator", kind: "scripted", text: "A ring glints at a stall." }] };
    const run = port(parseStoryV2OrThrow(withReply));
    run.turn();
    run.turn();
    run.turn();
    await Promise.resolve();
    expect(run.calls).toHaveLength(1);
    expect(run.calls[0]).toEqual([expect.objectContaining({ kind: "agenda", id: "arin:debt:0", effects: { npc_replies: [expect.objectContaining({ text: "A ring glints at a stall." })] } })]);
  });
});
