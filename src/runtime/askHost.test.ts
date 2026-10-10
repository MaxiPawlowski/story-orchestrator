const host = { chat: [{ name: "Guard", mes: "Halt." }] as unknown[], chatId: "chat-a", ask: true };

jest.mock("@services/STAPI", () => ({
  getContext: () => ({ chat: host.chat, chatId: host.chatId }),
  getPlayerName: () => "Max",
  readChatInput: () => "",
  fillChatInput: () => ({ ok: true }),
}));

jest.mock("./settingsStore", () => ({ getGlobalSettings: () => ({ copilot: { enabled: true, ask: host.ask } }) }));

import { parseStoryV2OrThrow, type EngineState } from "@engine/index";
import type { ExtractionReply, ModelAsk } from "@extraction/index";
import { emptyEnvironment } from "@wizard/index";
import { PLAYER_REFUSAL } from "@copilot/agent/ask";
import { buildNarrativeStatus } from "./narrative";
import type { PipelineStatus } from "./pipeline";
import { mintToken, type RunOwnership } from "./runToken";
import { answerText, ASK_HOST_COPY, askInChat, chatAskContext, type AskManager } from "./askHost";
import { liveStateText } from "./askLiveState";
import type { RuntimeSnapshot } from "./types";

const story = parseStoryV2OrThrow({
  format: 2, id: "host", title: "Host", description: "d",
  qualities: [{ key: "secret_known", type: "bool", source: "extractor", rubric: "Known?" }],
  checkpoints: [
    { id: "a", name: "a-internal", player_name: "The Hall", objective: "Talk.", type: "anchor", start: true },
    { id: "b", name: "b-internal", player_name: "The Vault of Corvin", objective: "Unmask Corvin.", type: "anchor" },
  ],
  transitions: [{ from: "a", to: "b", priority: 0, gate: { q: "secret_known", op: "==", v: true } }],
  roster: [{ id: "guard", name: "Guard" }],
});

const pipeline = { state: "idle", text: "Waiting for your move.", detail: null, needsSetup: false, nextAction: null } as unknown as PipelineStatus;
const narrative = buildNarrativeStatus({ storyTitle: "Host", checkpointName: "The Hall", objective: null, lastTransition: null, openThreads: [], canon: "", tensionLevel: null, pendingCount: 0, pipeline });

const snapshot = (authorView: boolean): RuntimeSnapshot => ({
  ready: true, storyId: "host", storyTitle: "Host", status: "ok", narrative, pipeline, ui: { authorView }, activeCheckpointId: "a", activeCheckpointName: "a-internal",
  activeObjective: "Talk.", boundary: 3, blackboard: { secret_known: false }, requirements: { ready: true, missingMembers: [], missingLorebooks: [], missingPersonas: [] },
  extraction: { settings: { enabled: true, profileId: "p" } }, tension: { level: "tense" }, pendingDeltas: [], lastRollback: null, agencyRecovery: null, dismissedChecks: [],
}) as unknown as RuntimeSnapshot;

const lapsing = () => {
  const state = { ok: true };
  const ownership: RunOwnership = {
    mint: (window) => mintToken({ chatId: "chat-a", storyId: "host", storyHash: "h", sessionEpoch: 1, windowRevision: 0, lowestMutatedMessageId: null }, window ?? null),
    check: () => (state.ok ? { ok: true } : { ok: false, reason: "chat", detail: "another chat" }),
  };
  return { state, ownership };
};

const manager = (authorView: boolean, replies: string[], ownership = lapsing(), onCall?: () => void) => {
  const recaps: string[] = [];
  const asks: ModelAsk[] = [];
  const value = {
    model: async (_prompt: string, ask: ModelAsk): Promise<ExtractionReply> => { asks.push(ask); onCall?.(); return { text: replies.shift() ?? "" } as ExtractionReply; },
    getSnapshot: () => snapshot(authorView),
    getStory: () => story,
    getEngineState: () => ({ visitedPath: ["a"], activeCheckpointId: "a" }) as unknown as EngineState,
    getEnabledCharacterIds: () => ["guard"],
    getOwnership: () => ownership.ownership,
    memoryActions: { restingText: (text: string) => text },
    getProvisioningEnvironment: () => emptyEnvironment(),
    noteRecap: (summary: string) => { recaps.push(summary); },
  } as unknown as AskManager;
  return { value, recaps, asks, ownership };
};

describe("v2.8 09 B: Ask in a chat", () => {
  it("player mode builds the context from the played projection alone, and asks the authoring role's ask pass", async () => {
    const { value, asks } = manager(false, ['{"answer":"You are in The Hall.","topics":["feature/story-drawer"]}']);
    const context = chatAskContext(value, "player");
    expect(Object.keys(context).sort()).toEqual(["persona", "projection"]);
    expect(JSON.stringify(context)).not.toContain("Vault of Corvin");
    const outcome = await askInChat(value, "Where am I?");
    expect(asks.map((ask) => [ask.role, ask.pass])).toEqual([["authoring", "ask"]]);
    expect(outcome).toMatchObject({ ok: true, persona: "player", result: { status: "answered" } });
    expect(answerText(outcome)).toBe("You are in The Hall.\n\nFrom: Story drawer");
  });

  it("Author view gives author Ask: the played story and the live state, author fields included", async () => {
    const { value } = manager(true, []);
    const context = chatAskContext(value, "author");
    expect(context.persona === "author" && context.liveState?.()).toContain("Checkpoint: a-internal [a]");
    expect(context.persona === "author" && context.draft?.title).toBe("Host");
  });

  it("a refused read in player Ask is journaled once and the answer still comes back", async () => {
    const { value, recaps } = manager(false, ['{"tool":"readStory"}', '{"answer":"I can only talk about what you have played so far.","topics":[]}']);
    const outcome = await askInChat(value, "Who is Corvin?");
    expect(recaps).toEqual(["Ask (player): a readStory read was refused and not retried"]);
    expect(outcome).toMatchObject({ ok: true, result: { answer: PLAYER_REFUSAL } });
  });

  it("a chat switch while the answer is written journals nothing and returns stale", async () => {
    const ownership = lapsing();
    const { value, recaps } = manager(false, ['{"tool":"readStory"}', '{"answer":"late","topics":[]}'], ownership, () => { ownership.state.ok = false; });
    expect(await askInChat(value, "Who is Corvin?")).toEqual({ ok: false, reason: ASK_HOST_COPY.stale });
    expect(recaps).toEqual([]);
  });

  it("does nothing when Ask is switched off", async () => {
    host.ask = false;
    const { value, asks } = manager(false, []);
    expect(await askInChat(value, "q")).toEqual({ ok: false, reason: ASK_HOST_COPY.off });
    expect(asks).toEqual([]);
    host.ask = true;
  });

  it("the live state names the checkpoint, the values and what the story is doing", () => {
    const text = liveStateText(snapshot(true));
    expect(text).toContain("Values: secret_known=false");
    expect(text).toContain("What the story is doing: idle: Waiting for your move.");
    expect(liveStateText({ ...snapshot(true), storyId: null })).toMatch(/^No story plays/);
  });
});
