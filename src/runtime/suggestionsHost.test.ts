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

import { parseStoryOrThrow, type EngineState } from "@engine/index";
import { heldSecrets, withoutSecrets, type EpistemicEntry } from "@memory/index";
import type { ExtractionReply, ModelAsk } from "@extraction/index";
import { buildNarrativeStatus } from "./narrative";
import type { PipelineStatus } from "./pipeline";
import { askSuggestions, fillSuggestion, projectionFor, SUGGESTION_COPY, type SuggestionManager } from "./suggestionsHost";
import type { RuntimeSnapshot } from "./types";
import { testOwnership } from "../../test/findings/testOwnership";
import { mintToken, tokenMatches, type RunContext, type RunOwnership } from "./runToken";

const story = parseStoryOrThrow({
  id: "host", title: "Host", description: "d",
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

const KEPT = { id: "h-guard", subject: "Guard", tag: "hiding", hiddenFrom: "Max", content: "that the cellar key is hidden under the doormat", createdAt: 1, messageId: 1 } as unknown as EpistemicEntry;

const restingWith = (epistemic: EpistemicEntry[]) => (text: string) => withoutSecrets(text, heldSecrets(epistemic, ["Guard", "Max"]), null);

const manager = (held: boolean, reply: (prompt: string, ask: ModelAsk) => string, prompts: string[] = [], over: Partial<SuggestionManager> = {}): SuggestionManager => ({
  model: async (prompt: string, ask: ModelAsk): Promise<ExtractionReply> => {
    prompts.push(prompt);
    return { text: reply(prompt, ask) } as ExtractionReply;
  },
  getSnapshot: () => snapshotWith(held),
  getCachedSnapshot: () => snapshotWith(held),
  getBoundaryLog: () => [],
  getStory: () => story,
  getEngineState: () => ({ visitedPath: ["a"], activeCheckpointId: "a" }) as unknown as EngineState,
  getEnabledCharacterIds: () => ["guard"],
  getOwnership: () => testOwnership(),
  memoryActions: { restingText: (text: string) => text },
  ...over,
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

  it("Sol finding 8: a held secret paraphrased in the story-so-far prose never reaches the request; the rest of the prose does", async () => {
    const canon = "The guard tucked the cellar key beneath the doormat before anyone arrived. Max reached the hall at dusk.";
    const withCanon = { ...narrative, sections: [...narrative.sections, { id: "story", label: "The story so far", lines: [canon] }] };
    const snapshot = () => ({ ...snapshotWith(true), narrative: withCanon }) as unknown as RuntimeSnapshot;
    const prompts: string[] = [];
    await askSuggestions(manager(true, () => FOUR, prompts, { getSnapshot: snapshot, memoryActions: { restingText: restingWith([KEPT]) } }));
    expect(prompts[0]).not.toMatch(/doormat|cellar key/);
    expect(prompts[0]).toContain("Max reached the hall at dusk.");
    await askSuggestions(manager(true, () => FOUR, prompts, { getSnapshot: snapshot, memoryActions: { restingText: restingWith([]) } }));
    expect(prompts[1]).toContain("cellar key beneath the doormat");
  });

  it("Sol finding 8: a line that is nothing but the secret is dropped, not sent empty", () => {
    const only = { ...narrative, sections: [...narrative.sections, { id: "threads", label: "Open threads", lines: ["Under the doormat lies the cellar key."] }] };
    const projection = projectionFor(manager(true, () => FOUR, [], { getSnapshot: () => ({ ...snapshotWith(true), narrative: only }) as unknown as RuntimeSnapshot, memoryActions: { restingText: restingWith([KEPT]) } }));
    expect(projection.sections.find((section) => section.id === "threads")).toBeUndefined();
  });

  it("asks the memory model's read role once, off the reply path, and drops the player's own last line", async () => {
    const asks: ModelAsk[] = [];
    const outcome = await askSuggestions(manager(false, (_prompt, ask) => { asks.push(ask); return FOUR; }));
    expect(asks.map((ask) => [ask.role, ask.pass])).toEqual([["read", "suggestions"]]);
    expect(outcome.ok && outcome.suggestions.map((line) => line.text)).toEqual(["I ask the guard about the door.", "I look around the hall.", "Who else came here tonight?"]);
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

describe("v2.8 04 C5: a suggestion never names a scene the player has not reached", () => {
  const gated = parseStoryOrThrow({
    id: "gated-host", title: "Host", description: "d",
    qualities: [{ key: "secret_known", type: "bool", source: "extractor", rubric: "Known?" }],
    checkpoints: [
      { id: "a", name: "a-internal", player_name: "The Hall", objective: "Talk.", type: "anchor", start: true },
      { id: "b", name: "b-internal", player_name: "The Sealed Vault", objective: "Open it.", type: "anchor" },
    ],
    transitions: [{ from: "a", to: "b", priority: 0, gate: { q: "secret_known", op: "==", v: true } }],
    roster: [{ id: "guard", name: "Guard" }],
  });
  const reply = () => `${FOUR}\n- I search for the sealed vault.`;

  it("drops the line naming the unreached scene and keeps the rest", async () => {
    const outcome = await askSuggestions(manager(false, reply, [], { getStory: () => gated }));
    expect(outcome.ok && outcome.suggestions.map((line) => line.text)).toEqual(["I ask the guard about the door.", "I look around the hall.", "Who else came here tonight?"]);
  });

  it("control: once the scene is reached the same line is kept", async () => {
    const reached = { getStory: () => gated, getEngineState: () => ({ visitedPath: ["a"], activeCheckpointId: "b" }) as unknown as EngineState };
    const outcome = await askSuggestions(manager(false, reply, [], reached));
    expect(outcome.ok && outcome.suggestions.map((line) => line.text)).toContain("I search for the sealed vault.");
  });
});

describe("Astra P1: a suggestion set is bound to the transcript it read", () => {
  const editing = () => {
    const context: RunContext = { chatId: "chat-a", storyId: "host", storyHash: "h", sessionEpoch: 1, windowRevision: 0, lowestMutatedMessageId: null };
    const ownership: RunOwnership = { mint: (window) => mintToken(context, window ?? null), check: (token) => tokenMatches(context, token) };
    const edit = (messageId: number) => { context.windowRevision += 1; context.lowestMutatedMessageId = messageId; };
    return { ownership, edit };
  };

  it("refuses an answer when a message it read was edited while it ran", async () => {
    const { ownership, edit } = editing();
    const outcome = await askSuggestions(manager(false, () => { edit(0); return FOUR; }, [], { getOwnership: () => ownership }));
    expect(outcome).toEqual({ ok: false, reason: SUGGESTION_COPY.stale });
  });

  it("refuses to fill a suggestion whose transcript was edited after it arrived, and keeps a reply appended after it", async () => {
    const { ownership, edit } = editing();
    const outcome = await askSuggestions(manager(false, () => FOUR, [], { getOwnership: () => ownership }));
    if (!outcome.ok) throw new Error("no suggestions");
    edit(2);
    expect(fillSuggestion(outcome.ask, "I wait and listen.")).toEqual({ ok: true });
    host.box = "";
    edit(1);
    expect(fillSuggestion(outcome.ask, "I look around the hall.")).toEqual({ ok: false, reason: SUGGESTION_COPY.edited });
    expect(host.box).toBe("");
  });
});

describe("v2.9 06: anchored asks, the help line, greyed offers and the render-time screen", () => {
  const anchored = parseStoryOrThrow({
    id: "anchored", title: "Host", description: "d",
    qualities: [
      { key: "tried", type: "bool", source: "extractor", rubric: "Tried?" }, { key: "ok", type: "bool", source: "code", rubric: "Rolled" },
      { key: "has_rope", type: "bool", source: "extractor", rubric: "Rope?" }, { key: "has_lantern", type: "bool", source: "extractor", rubric: "Lantern?" },
    ],
    checkpoints: [
      { id: "a", name: "a-internal", player_name: "The Hall", objective: "Talk.", player_text: "Get past the guard.", type: "anchor", start: true,
        offers: [{ id: "bribe", text: "I offer the guard a coin." }, { id: "dark", text: "I slip down the cellar stairs.", needs: { when: { q: "has_lantern", op: "==", v: true }, reason: "You need a lantern first." } }] },
      { id: "b", name: "b-internal", player_name: "The Yard", objective: "Go.", type: "anchor" },
    ],
    transitions: [{ from: "a", to: "b", priority: 0, gate: { all: [{ q: "tried", op: "==", v: true }, { q: "ok", op: "==", v: true }] },
      check: { id: "climb", label: "Climb", quality: "ok", roll: { sides: 20, target: 12 }, narrate: "public", modifiers: [{ q: "has_rope", v: true, add: 4, hint: "a rope" }] } }],
    roster: [{ id: "guard", name: "Guard" }],
  });
  const state = { visitedPath: [], activeCheckpointId: "a", boundary: 4, checkpointStartedBoundary: 0, blackboard: { values: { tried: false, ok: false, has_rope: false, has_lantern: false } } } as unknown as EngineState;
  let snapshot: RuntimeSnapshot = snapshotWith(false);
  const over = (authorView: boolean, resting: (text: string) => string = (text) => text): Partial<SuggestionManager> => ({
    getStory: () => anchored, getEngineState: () => state, getCachedSnapshot: () => snapshot,
    getSnapshot: () => ({ ...snapshotWith(false), ui: { authorView } }) as unknown as RuntimeSnapshot, memoryActions: { restingText: resting },
  });

  it("sends the anchors in the one suggestions call and maps tagged lines back; author view only names them", async () => {
    const prompts: string[] = [];
    const reply = "- [1] I look for another way past the guard.\n- [2] I wonder about the weather.\n- I wait.\n- I hum.";
    const outcome = await askSuggestions(manager(false, () => reply, prompts, over(true)));
    expect(prompts).toHaveLength(1);
    expect(prompts[0]).toContain("[1] Get past the guard.");
    if (!outcome.ok || !outcome.side) throw new Error("no suggestions");
    expect(outcome.suggestions[0]).toEqual({ text: "I look for another way past the guard.", anchorId: "objective:a" });
    expect(outcome.suggestions.filter((line) => line.authored).map((line) => line.text)).toEqual(["I offer the guard a coin."]);
    expect(outcome.side.help).toEqual([{ checkId: "climb", label: "Climb", hints: [{ text: "a rope", have: false }] }]);
    expect(outcome.side.unavailable).toEqual([{ id: "dark", text: "I slip down the cellar stairs.", reason: "You need a lantern first." }]);
    expect(outcome.side.author?.anchors.map((entry) => entry.kind)).toEqual(["objective", "check-help", "offer"]);
    expect(outcome.side.author).toMatchObject({ grounded: 1, lines: 4 });
    const player = await askSuggestions(manager(false, () => reply, [], over(false)));
    expect(player.side?.author).toBeNull();
  });

  it("the help line and greyed offers survive a failed answer", async () => {
    const outcome = await askSuggestions(manager(false, () => "- one", [], over(false)));
    expect(outcome.ok).toBe(false);
    expect(outcome.side?.help).toHaveLength(1);
  });

  it("a secret introduced after the panel opened drops the model-free line at render", async () => {
    let secret = false;
    const resting = (text: string) => (secret && /rope/.test(text) ? "" : text);
    const outcome = await askSuggestions(manager(false, () => FOUR, [], over(false, resting)));
    expect(outcome.side?.shows("a rope")).toBe(true);
    secret = true;
    snapshot = snapshotWith(true);
    expect(outcome.side?.shows("a rope")).toBe(false);
    expect(outcome.side?.shows("I offer the guard a coin.")).toBe(true);
  });
});
