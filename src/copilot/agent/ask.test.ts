import type { StoryV2 } from "@engine/index";
import type { PlayedProjection } from "@runtime/playerProjection";
import {
  AUTHOR_ASK_TOOLS, ASK_COPY, PLAYER_ASK_TOOLS, PLAYER_REFUSAL, askToolSpec, checkAskCall, parseAskReply, renderAskPrompt, runAsk, runAskTool,
  type AskContext, type AskStep,
} from "./ask";
import { EDIT_TOOLS, PROVISION_TOOLS, READ_TOOLS } from "./tools";
import { emptyLookup } from "./types";

const draft = (): StoryV2 => ({
  format: 2,
  title: "The Ferry",
  description: "A crossing.",
  qualities: [{ key: "ferry_paid", type: "bool", source: "extractor", rubric: "Paid?" }],
  checkpoints: [
    { id: "dock", name: "Dock", objective: "Pay the ferryman.", type: "anchor", start: true },
    { id: "vault", name: "The Vault of Corvin", objective: "Unmask Corvin.", type: "anchor" },
  ],
  transitions: [{ from: "dock", to: "vault", priority: 0, gate: { q: "ferry_paid", op: "==", v: true } }],
  roster: [],
} as StoryV2);

const projection: PlayedProjection = {
  title: "The Ferry", intro: "Cross before dawn.", player: "Max", visited: ["The Dock"], current: { name: "The Dock", text: "Fog." },
  sections: [{ id: "now", label: "Where you are", lines: ["The Dock"] }], cast: ["Ferryman"], transcript: [{ speaker: "Ferryman", text: "Two coins." }],
};

const player: AskContext = { persona: "player", projection };
const author = (live: string | null = "checkpoint dock"): AskContext => ({ persona: "author", draft: draft(), lookup: emptyLookup(), liveState: live === null ? null : () => live });

const scripted = (replies: Array<string | Record<string, unknown>>) => {
  const queue = replies.map((reply) => (typeof reply === "string" ? reply : JSON.stringify(reply)));
  const prompts: string[] = [];
  return { prompts, model: async (prompt: string) => { prompts.push(prompt); return queue.shift() ?? ""; } };
};

const WRITE_TOOLS = [...Object.keys(EDIT_TOOLS), ...Object.keys(PROVISION_TOOLS)];

describe("v2.8 09 B: Ask mode tool sets", () => {
  it("neither Ask tool set holds a write tool, and every name is a read", () => {
    for (const names of [AUTHOR_ASK_TOOLS, PLAYER_ASK_TOOLS]) {
      expect(names.filter((name) => WRITE_TOOLS.includes(name))).toEqual([]);
      expect(names.filter((name) => askToolSpec(name)?.family !== "read" && askToolSpec(name)?.family !== "simulate" && askToolSpec(name)?.family !== "lookup")).toEqual([]);
    }
  });

  it("the player set is the knowledge and the played projection, nothing of the draft", () => {
    expect([...PLAYER_ASK_TOOLS].sort()).toEqual(["readKnowledge", "readPlayed", "searchKnowledge"]);
    expect(Object.keys(READ_TOOLS).filter((name) => PLAYER_ASK_TOOLS.includes(name))).toEqual([]);
  });

  it("every write tool is refused in both personas, before it runs", () => {
    for (const tool of WRITE_TOOLS) {
      expect(checkAskCall("author", { tool, args: {} })).toEqual({ ok: false, message: expect.stringContaining("Ask mode only reads") });
      expect(checkAskCall("player", { tool, args: {} })).toEqual({ ok: false, message: PLAYER_REFUSAL });
    }
  });

  it("every author read and simulate tool is refused in player Ask with the neutral line", () => {
    for (const tool of [...Object.keys(READ_TOOLS), "readLiveState", "readRecommendations"]) {
      expect(checkAskCall("player", { tool, args: {} })).toEqual({ ok: false, message: PLAYER_REFUSAL });
    }
  });

  it("checks arguments with a did-you-mean, like the agent's tools", () => {
    expect(checkAskCall("author", { tool: "readKnowledge", args: { topc: "x" } })).toEqual({ ok: false, message: expect.stringContaining('(did you mean "topic"?)') });
    expect(checkAskCall("author", { tool: "readKnowledg", args: {} })).toEqual({ ok: false, message: expect.stringContaining('did you mean "readKnowledge"') });
    expect(checkAskCall("player", { tool: "readPlayed", args: {} })).toMatchObject({ ok: true });
  });
});

describe("v2.8 09 B: Ask tools", () => {
  it("player reads answer from the projection and player topics only", () => {
    expect(runAskTool(player, { tool: "readPlayed", args: {} })).toContain("Scenes so far: The Dock");
    expect(runAskTool(player, { tool: "readKnowledge", args: { topic: "st/lorebook-activation" } })).toMatch(/^No topic/);
    expect(runAskTool(player, { tool: "readStory", args: {} })).toBe(PLAYER_REFUSAL);
  });

  it("author reads reach the draft, the live state, the knowledge and the recommendations", () => {
    expect(runAskTool(author(), { tool: "readStory", args: {} })).toContain("The Vault of Corvin");
    expect(runAskTool(author(), { tool: "readLiveState", args: {} })).toBe("checkpoint dock");
    expect(runAskTool(author(null), { tool: "readLiveState", args: {} })).toMatch(/outside a chat/);
    expect(runAskTool(author(), { tool: "readKnowledge", args: { topic: "st/lorebook-activation" } })).toContain("constant entry");
    expect(runAskTool(author(), { tool: "readRecommendations", args: {} })).toMatch(/^Nothing to fix|^- \[/);
    expect(runAskTool({ persona: "author", draft: null, lookup: emptyLookup(), liveState: null }, { tool: "readStory", args: {} })).toMatch(/^No story is open/);
  });

  it("recommendations explain a diagnostic in plain words and name its topic", () => {
    const broken = { ...draft(), transitions: [{ from: "dock", to: "vault", priority: 0, gate: { q: "missing_quality", op: "==", v: true } }] } as StoryV2;
    expect(runAskTool({ persona: "author", draft: broken, lookup: emptyLookup(), liveState: null }, { tool: "readRecommendations", args: {} }))
      .toContain("This gate can never open as written. (at transitions");
  });
});

describe("v2.8 09 B: parseAskReply", () => {
  it("reads a call, an answer with topics, and refuses the rest", () => {
    expect(parseAskReply('{"tool":"readPlayed"}')).toEqual({ ok: true, reply: { kind: "call", call: { tool: "readPlayed", args: {} } } });
    expect(parseAskReply('```json\n{"answer":"Yes.","topics":["feature/memory", 3]}\n```')).toEqual({ ok: true, reply: { kind: "answer", answer: "Yes.", topics: ["feature/memory"] } });
    expect(parseAskReply("hello")).toMatchObject({ ok: false });
    expect(parseAskReply('{"answer":"x","tool":"readPlayed"}')).toMatchObject({ ok: false });
    expect(parseAskReply('{"anwser":"x"}')).toEqual({ ok: false, issues: [expect.stringContaining('did you mean "answer"')] });
    expect(parseAskReply('[{"tool":"readPlayed"}]')).toMatchObject({ ok: false });
  });
});

describe("v2.8 09 B: runAsk", () => {
  it("reads, then answers; cited topics are checked and the first showable one gives Show me", async () => {
    const { model } = scripted([
      { tool: "searchKnowledge", args: { query: "author view" } },
      { answer: "Author view adds the internals.", topics: ["feature/author-view", "nope/unknown"] },
    ]);
    const result = await runAsk({ question: "What does Author view show?", context: author(), model });
    expect(result.status).toBe("answered");
    expect(result.topics.map((topic) => topic.id)).toEqual(["feature/author-view"]);
    expect(result.showMe).toEqual({ kind: "feature", target: "author-view" });
    expect(result.steps[0]).toMatchObject({ status: "observed", call: { tool: "searchKnowledge" } });
  });

  it("player Ask drops a cited author topic and never offers a Studio Show me", async () => {
    const { model } = scripted([{ answer: "x", topics: ["author/gates", "st/groups", "feature/memory-tab"] }]);
    const result = await runAsk({ question: "q", context: player, model });
    expect(result.topics.map((topic) => topic.id)).toEqual(["feature/memory-tab"]);
    expect(result.showMe).toEqual({ kind: "feature", target: "memory-tab" });
  });

  it("a refused call is journaled once and never retried: the same call again ends the run", async () => {
    const { model, prompts } = scripted([{ tool: "readStory" }, { tool: "readStory" }, { answer: "late" }]);
    const refused: AskStep[] = [];
    const result = await runAsk({ question: "Who betrays me?", context: player, model, onRefused: (step) => refused.push(step) });
    expect(refused).toHaveLength(1);
    expect(refused[0].observation).toBe(`Refused: ${PLAYER_REFUSAL}`);
    expect(result).toMatchObject({ status: "failed", answer: ASK_COPY.noAnswer });
    expect(prompts).toHaveLength(2);
  });

  it("stops reading at the step limit and asks for the answer", async () => {
    const { model, prompts } = scripted([...Array.from({ length: 2 }, (_, index) => ({ tool: "searchKnowledge", args: { query: `memory ${index}` } })), { answer: "done", topics: [] }]);
    const result = await runAsk({ question: "q", context: author(), model, maxSteps: 2 });
    expect(result.status).toBe("answered");
    expect(prompts.at(-1)).toContain("ANSWER NOW");
  });

  it("an empty question asks nothing", async () => {
    const { model, prompts } = scripted([]);
    expect(await runAsk({ question: "  ", context: player, model })).toMatchObject({ status: "failed", answer: ASK_COPY.empty });
    expect(prompts).toEqual([]);
  });

  it("the player prompt lists only the player tools and carries the projection, never a draft", () => {
    const prompt = renderAskPrompt(player, "Who is the traitor?", []);
    expect(prompt).toContain("PLAYED\nStory: The Ferry");
    expect(Object.keys(READ_TOOLS).filter((name) => prompt.includes(`- ${name}(`))).toEqual([]);
    expect(prompt).not.toContain("DRAFT");
  });
});
