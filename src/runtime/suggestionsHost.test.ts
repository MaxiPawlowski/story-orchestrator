const host = {
  chat: [] as unknown[],
  chatId: "chat-a",
  box: "",
  fills: [] as Array<[string, string]>,
};

jest.mock("@services/STAPI", () => ({
  getContext: () => ({ chat: host.chat, chatId: host.chatId }),
  getPlayerName: () => "Max",
  readChatInput: () => host.box,
  fillChatInput: (text: string, expected: string) => {
    host.fills.push([text, expected]);
    if (host.box.trim() && host.box !== expected) return { ok: false, reason: "typed" };
    host.box = text;
    return { ok: true };
  },
}));

import { parseStoryV2OrThrow, type EngineState } from "@engine/index";
import type { ExtractionReply, ModelAsk } from "@extraction/index";
import { buildNarrativeStatus } from "./narrative";
import type { PipelineStatus } from "./pipeline";
import { askSuggestions, fillSuggestion, projectionFor, SUGGESTION_COPY, type SuggestionManager } from "./suggestionsHost";
import type { RuntimeSnapshot } from "./types";
import { testOwnership } from "../../test/findings/testOwnership";

const story = parseStoryV2OrThrow({
  format: 2, id: "host", title: "Host", description: "d",
  qualities: [{ key: "secret_known", type: "bool", source: "extractor", rubric: "Known?" }],
  checkpoints: [{ id: "a", name: "a-internal", player_name: "The Hall", objective: "Talk.", type: "anchor", start: true }],
  transitions: [],
  roster: [{ id: "guard", name: "Guard" }],
});

const narrative = buildNarrativeStatus({
  storyTitle: "Host", checkpointName: "The Hall", objective: null, lastTransition: null, openThreads: [], canon: "", tensionLevel: null, pendingCount: 0,
  pipeline: { state: "idle", text: "", needsSetup: false, nextAction: "none" } as unknown as PipelineStatus,
});

const SECRET = "Guard is concealing from Max: the key is under the mat";

const snapshotWith = (held: boolean): RuntimeSnapshot => ({
  narrative,
  secretsHeld: held,
  memory: { epistemic: held ? [{ subject: "Guard", kind: "hiding", text: SECRET }] : [], ledger: held ? [{ entity: "Guard", field: "key", value: "mat" }] : [] },
  nextTurn: held ? { blocks: [{ key: "private", text: SECRET }] } : { blocks: [] },
  privateBlocks: held ? [{ key: "private", value: SECRET }] : [],
}) as unknown as RuntimeSnapshot;

const manager = (held: boolean, reply: (prompt: string, ask: ModelAsk) => string, prompts: string[] = []): SuggestionManager => ({
  model: async (prompt: string, ask: ModelAsk): Promise<ExtractionReply> => {
    prompts.push(prompt);
    return { text: reply(prompt, ask) } as ExtractionReply;
  },
  getSnapshot: () => snapshotWith(held),
  getStory: () => story,
  getEngineState: () => ({ visitedPath: ["a"], activeCheckpointId: "a" }) as unknown as EngineState,
  getEnabledCharacterIds: () => ["guard"],
  getOwnership: () => testOwnership(),
}) as unknown as SuggestionManager;

const FOUR = "- I ask the guard about the door.\n- I look around the hall.\n- \"Who else came here tonight?\"\n- I wait and listen.";

beforeEach(() => {
  host.chat = [{ name: "Guard", mes: "Halt." }, { name: "Max", is_user: true, mes: "I wait and listen." }];
  host.chatId = "chat-a";
  host.box = "";
  host.fills = [];
});

describe("v2.7 33 W4: the suggestion request", () => {
  it("K1: the projection, and so the request, is identical with and without a held secret", async () => {
    expect(projectionFor(manager(true, () => FOUR))).toEqual(projectionFor(manager(false, () => FOUR)));
    const prompts: string[] = [];
    await askSuggestions(manager(true, () => FOUR, prompts));
    await askSuggestions(manager(false, () => FOUR, prompts));
    expect(prompts[0]).toBe(prompts[1]);
    expect(prompts[0]).not.toContain("key is under the mat");
    expect(prompts[0]).not.toContain("secret_known");
  });

  it("asks the memory model's read role once, off the reply path, and drops the player's own last line", async () => {
    const asks: ModelAsk[] = [];
    const outcome = await askSuggestions(manager(false, (_prompt, ask) => { asks.push(ask); return FOUR; }));
    expect(asks.map((ask) => [ask.role, ask.pass])).toEqual([["read", "suggestions"]]);
    expect(outcome.ok && outcome.suggestions).toEqual(["I ask the guard about the door.", "I look around the hall.", "Who else came here tonight?"]);
  });

  it("answers a failure in player words when fewer than three usable lines came back", async () => {
    expect(await askSuggestions(manager(false, () => "- one"))).toEqual({ ok: false, reason: SUGGESTION_COPY.failed });
  });

  it("refuses an answer that lands after the chat changed", async () => {
    const outcome = await askSuggestions(manager(false, () => { host.chatId = "chat-b"; return FOUR; }));
    expect(outcome).toEqual({ ok: false, reason: SUGGESTION_COPY.stale });
  });
});

describe("v2.7 33 W4: filling the box never sends, and never overwrites the player", () => {
  it("fills an empty box, and a box still holding what it held at the ask", async () => {
    const outcome = await askSuggestions(manager(false, () => FOUR));
    if (!outcome.ok) throw new Error("no suggestions");
    expect(fillSuggestion(outcome.ask, "I look around the hall.")).toEqual({ ok: true });
    expect(host.box).toBe("I look around the hall.");
  });

  it("refuses when the player typed something since, or the chat changed", async () => {
    const outcome = await askSuggestions(manager(false, () => FOUR));
    if (!outcome.ok) throw new Error("no suggestions");
    host.box = "I draw my";
    expect(fillSuggestion(outcome.ask, "I look around the hall.")).toEqual({ ok: false, reason: "typed" });
    expect(host.box).toBe("I draw my");
    host.chatId = "chat-b";
    expect(fillSuggestion(outcome.ask, "I look around the hall.")).toEqual({ ok: false, reason: SUGGESTION_COPY.chatChanged });
  });
});
