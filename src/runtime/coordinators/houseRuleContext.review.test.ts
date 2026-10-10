import { plantedModel } from "../../../test/support/modelCall";
import { parseStoryV2OrThrow, type EngineState, type NormalizedStoryV2 } from "@engine/index";
import { defaultJudgeSettings, type JudgeAnswer, type JudgeRequest, type JudgeSettings } from "@judge/index";
import { StagecraftCoordinator, type StagecraftCoordinatorDeps } from "./stagecraftCoordinator";
import { createStagecraft } from "../extras";
import { createWarden, houseRuleScene } from "../continuity";
import { JudgeRuntime } from "../judge";
import { LoreEvidence, type ScanInput } from "../worldInfoEvidence";
import type { RunContext } from "../runToken";
import type { StagecraftRuntimeState } from "../types";
import { testOwnership } from "../../../test/findings/testOwnership";

const RULES = ["{{user}}'s choices belong to {{user}}.", "Facts stay consistent with the world book."];
const MIRROR = "Story Orchestrator - Rules - chat-1";
const STORY_TEXT = "Vallie is a one-eyed minotaur.";
const MIRROR_TEXT = "Max owes Vallie ten crowns.";
const FOREIGN_TEXT = "The foreign book says dragons rule Aegis.";

const story = (): NormalizedStoryV2 => parseStoryV2OrThrow({
  format: 2, id: "rules", title: "Rules", description: "House rules with context.",
  qualities: [{ key: "signed", type: "bool", source: "extractor", rubric: "Signed?" }],
  checkpoints: [{ id: "cp1", name: "The hall", objective: "Sign", type: "anchor", start: true }],
  transitions: [],
  roster: [{ id: "dm", name: "Narrator", role: "narrator: voices the world and every character outside the group" }, { id: "belle", name: "Belle", role: "companion" }],
  house_rules: RULES,
});
const engineState = { activeCheckpointId: "cp1", boundary: 3, lastMessageId: 1 } as unknown as EngineState;
const view = { getStory: () => story(), getState: () => engineState };

const evidenceFor = (replyMessageId: number) => {
  const evidence = new LoreEvidence();
  const context = (): RunContext => ({ chatId: "chat-1", storyId: "rules", storyHash: "h1", sessionEpoch: 1, windowRevision: 0, lowestMutatedSince: () => null });
  evidence.attach({ chatId: () => "chat-1", context, now: () => "2026-10-02T00:00:00.000Z" });
  const entry = (uid: number, comment: string, content: string, world: string, constant = false): ScanInput => ({ world, uid, comment, content, constant });
  evidence.opened({ type: "normal" });
  evidence.scanned([
    entry(1, "Vallie", STORY_TEXT, "Adolion World"),
    entry(2, "Primer", "The world of Adolion.", "Adolion World", true),
    entry(7, "so_debt", MIRROR_TEXT, MIRROR),
    entry(9, "Dragons", FOREIGN_TEXT, "Someone Else's Book"),
  ], "normal", true, ["Adolion World"]);
  evidence.settled({ rendered: true, lastMessageId: replyMessageId, story: story(), path: ["cp1"], mirrorBook: MIRROR });
  return evidence;
};

const judgeWith = (uses: Partial<JudgeSettings["uses"]>) => {
  const off = Object.fromEntries(Object.keys(defaultJudgeSettings().uses).map((key) => [key, false])) as JudgeSettings["uses"];
  const settings: JudgeSettings = { ...defaultJudgeSettings(), enabled: true, uses: { ...off, ...uses } };
  const requests: JudgeRequest[] = [];
  const judge = new JudgeRuntime({
    ownership: testOwnership(),
    getSettings: () => settings,
    transport: async (request) => {
      requests.push(request);
      return { model: "jev-1.13.0", answers: Object.fromEntries(Object.keys(request.questions).map((key): [string, JudgeAnswer] => [key, { type: "noul", noul: key === "rule:1" ? 0.9 : 0.05 }])) };
    },
    status: async () => ({ configured: true }),
    record: () => undefined,
    context: () => ({ boundary: 3, messageId: 1 }),
  });
  return { judge, requests };
};

const chat = [{ name: "Max", mes: "I look up at the stairs.", is_user: true }, { name: "Narrator", mes: "A silver-haired elf watches from the rail.\n\nShe raises a glass.", is_user: false }];
const host = {
  setStoryExtensionPrompt: jest.fn(), clearStoryExtensionPrompt: jest.fn(), loadLorebook: jest.fn(), readWIEntry: jest.fn(), readWIEntryAt: jest.fn(),
  restoreWIEntryAt: jest.fn(), upsertWIEntry: jest.fn(), enableWIEntry: jest.fn(), disableWIEntry: jest.fn(), getPlayerName: () => "Max",
};

const pass = async (uses: Partial<JudgeSettings["uses"]>, options: { scene?: boolean } = {}) => {
  const env = judgeWith(uses);
  const evidence = evidenceFor(1);
  const loreReads: number[] = [];
  let state: StagecraftRuntimeState = { ...createStagecraft(), settings: { createEnabled: false, createRequireMeasured: false, curatorEnabled: false, acceptMode: "review", wardenEnabled: true, wardenAcceptMode: "review" } };
  const warden = createWarden(() => env.judge, view, {
    facts: () => [{ id: "f", text: "The hall is open." }],
    nudgeActive: () => false,
    lore: (messageId) => { loreReads.push(messageId); return evidence.firedLore(messageId); },
    ...(options.scene === false ? {} : { group: () => ["Narrator", "Belle"] }),
  });
  const coordinator = new StagecraftCoordinator({
    hosts: { prompt: host, chat: { chatRows: () => chat }, player: host, curator: host } as never, ownership: testOwnership(),
    getStory: () => story(), getState: () => engineState, getStagecraft: () => state, setStagecraft: (next) => { state = next; },
    model: plantedModel, getCanon: () => "", getOpenArcs: () => [], warden,
    journal: () => undefined, persist: async () => undefined, notify: () => undefined,
  } as StagecraftCoordinatorDeps);
  await coordinator.runWardenPass(1);
  return { requests: env.requests, loreReads, state: () => state };
};

describe("house rules with context: the warden pass end to end (LoreEvidence -> coordinator -> judge request)", () => {
  it("the house-rule call carries the story book's fired entry, the scene and the resolved persona, and flags by the authored rule", async () => {
    const run = await pass({ houseRules: true });
    const rules = run.requests.find((request) => "house_rules" in request.state)!;
    expect(run.requests).toHaveLength(2);
    expect(rules.state.world_book).toEqual({ entry_0: { title: "Vallie", text: STORY_TEXT }, entry_1: { title: "Primer", text: "The world of Adolion." } });
    expect(rules.state.scene).toEqual({
      player: "Max", speaker_role: "narrator: voices the world and every character outside the group", group_members: ["Narrator", "Belle"], player_message: "I look up at the stairs.",
    });
    expect(rules.state.house_rules).toEqual({ rule_0: "Max's choices belong to Max.", rule_1: "Facts stay consistent with the world book." });
    const record = run.state().proposals.at(-1)!;
    expect(record.ops.map((entry) => entry.op)).toEqual([expect.objectContaining({ kind: "note", rules: [RULES[1]] })]);
  });

  it("control: a mirror or foreign book's text never reaches any request, and no entry text lands in the stagecraft state", async () => {
    const run = await pass({ houseRules: true, wardenLore: true });
    const sent = JSON.stringify(run.requests);
    expect(sent).toContain(STORY_TEXT);
    expect(sent).not.toContain(MIRROR_TEXT);
    expect(sent).not.toContain(FOREIGN_TEXT);
    expect(JSON.stringify(run.state())).not.toContain(STORY_TEXT);
  });

  it("use off: no lore read, no scene, and the request is byte-identical to a warden without the context wiring", async () => {
    const off = await pass({});
    const bare = await pass({}, { scene: false });
    expect(off.loreReads).toEqual([]);
    expect(off.requests).toHaveLength(1);
    expect(JSON.stringify(off.requests)).toBe(JSON.stringify(bare.requests));
    expect(JSON.stringify(off.requests)).not.toMatch(/house_rules|scene|world_book/);
  });

  it("the scene names the speaker's authored role, or none for a name outside the roster", () => {
    expect(houseRuleScene(story(), " narrator ", ["Belle"])).toEqual({ speakerRole: "narrator: voices the world and every character outside the group", groupMembers: ["Belle"] });
    expect(houseRuleScene(story(), "Qinne", [])).toEqual({ groupMembers: [] });
  });
});
