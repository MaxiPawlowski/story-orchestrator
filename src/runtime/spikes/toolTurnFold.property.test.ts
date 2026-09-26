import { readFileSync } from "fs";
import { join } from "path";
import { StoryEngine } from "@engine/engine";
import { parseStoryV2OrThrow } from "@engine/validate";
import type { BlackboardDelta } from "@engine/blackboard";
import { TurnBridge, type FoldVerdict } from "../turnBridge";
import type { RuntimeManager } from "../runtimeManager";
import { toolTurnVerdict } from "./toolTurnFold";
import { testOwnership } from "../../../test/findings/testOwnership";

interface SimMessage {
  mes: string;
  name: string;
  is_user: boolean;
  is_system: boolean;
  send_date: string;
  extra: { tool_invocations?: unknown[] };
  deltas: BlackboardDelta[];
}

const mockHost = { chat: [] as SimMessage[], generating: false, handlers: new Map<string, (...args: unknown[]) => unknown>() };

jest.mock("@services/STAPI", () => ({
  getContext: () => ({ chat: mockHost.chat, chatId: "sp10" }),
  isHostGenerating: () => mockHost.generating,
  subscribeToHostEvents: (entries: Array<{ eventName: string; handler: (...args: unknown[]) => unknown }>) => {
    for (const entry of entries) mockHost.handlers.set(entry.eventName, entry.handler);
    return () => mockHost.handlers.clear();
  },
}));

const SEEDS = [1, 7, 20260921, 424242];
const CHATS_PER_SEED = 200;
const STORY = parseStoryV2OrThrow(JSON.parse(readFileSync(join(__dirname, "../../../test/fixtures/v25-09-tool-fold.story.json"), "utf8")));

const rng = (seed: number) => {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
};

type Chain = number[];

interface SimChat {
  messages: SimMessage[];
  chains: Chain[];
}

const message = (index: number, kind: "user" | "reply" | "tool", deltas: BlackboardDelta[] = []): SimMessage => ({
  mes: `${kind} ${index}`,
  name: kind === "user" ? "Player" : kind === "tool" ? "SillyTavern System" : "Arin",
  is_user: kind === "user",
  is_system: kind === "tool",
  send_date: `t${index}`,
  extra: kind === "tool" ? { tool_invocations: [{ name: "so_sp10_roll", result: "4" }] } : {},
  deltas,
});

const generateChat = (next: () => number): SimChat => {
  const messages: SimMessage[] = [message(0, "reply")];
  const chains: Chain[] = [];
  let clue = 0;
  let door = false;
  const findings = (): BlackboardDelta[] => {
    const out: BlackboardDelta[] = [];
    if (next() < 0.45) out.push({ q: "clue", v: ++clue, source: "extractor" });
    if (!door && clue >= 2 && next() < 0.3) {
      door = true;
      out.push({ q: "door", v: true, source: "extractor" });
    }
    return out;
  };
  const turns = 6 + Math.floor(next() * 5);
  for (let turn = 0; turn < turns; turn += 1) {
    messages.push(message(messages.length, "user"));
    const rounds = next() < 0.6 ? 1 + Math.floor(next() * 2) : 0;
    const chain: Chain = [];
    for (let round = 0; round < rounds; round += 1) {
      if (next() < 0.8) {
        chain.push(messages.length);
        messages.push(message(messages.length, "reply", findings()));
      }
      messages.push(message(messages.length, "tool"));
    }
    chain.push(messages.length);
    messages.push(message(messages.length, "reply", findings()));
    chains.push(chain);
  }
  return { messages, chains };
};

const flushAsync = async () => {
  for (let index = 0; index < 6; index += 1) await Promise.resolve();
};

const emit = async (eventName: string, ...args: unknown[]) => {
  await mockHost.handlers.get(eventName)?.(...args);
  await flushAsync();
};

const makeManager = (engine: StoryEngine) => ({
  getOwnership: () => testOwnership(),
  fireAfterSpeak: async () => undefined,
  rollbackFromMessage: async () => undefined,
  loadSelectedFromChat: async () => undefined,
  reapplyPromptBlocks: () => undefined,
  reapplyCopilotNudge: () => undefined,
  notify: () => undefined,
  commitBoundary: async (messageId?: number) => {
    const to = messageId ?? mockHost.chat.length - 1;
    const from = engine.serialize().lastMessageId + 1;
    const deltas = mockHost.chat.slice(from, to + 1).flatMap((entry) => entry.deltas);
    if (deltas.length) engine.enqueue({ source: "extractor", blackboardVersionSum: 0, turnRange: { from, to }, deltas });
    engine.commitBoundary({ lastMessageId: to, chatLength: mockHost.chat.length });
  },
});

const play = async (sim: SimChat, end: number, fold: FoldVerdict | null) => {
  const engine = new StoryEngine({ now: () => 0 });
  engine.loadStory(STORY);
  mockHost.handlers.clear();
  mockHost.chat = [];
  mockHost.generating = false;
  const bridge = new TurnBridge(makeManager(engine) as unknown as RuntimeManager, null, () => fold);
  bridge.start();
  for (const chain of sim.chains) {
    const start = chain[0] - 1;
    if (start >= end) break;
    mockHost.chat = sim.messages.slice(0, start + 1);
    await emit("MESSAGE_SENT", start);
    mockHost.generating = true;
    for (const id of chain.filter((id) => id < end)) {
      mockHost.chat = sim.messages.slice(0, id + 1);
      await emit("MESSAGE_RECEIVED", id, "normal");
    }
    mockHost.chat = sim.messages.slice(0, Math.min(end, chain[chain.length - 1] + 1));
    mockHost.generating = false;
    await emit("GENERATION_ENDED", mockHost.chat.length);
    jest.runOnlyPendingTimers();
    await flushAsync();
  }
  bridge.stop();
  return engine;
};

const rollback = (engine: StoryEngine, messageId: number) => {
  const boundary = engine.boundaryBeforeMessage(messageId);
  if (boundary !== null && engine.shouldRollbackFromMessage(messageId)) engine.rollbackTo(boundary);
  engine.clampToChat(messageId);
  engine.discardPendingFrom(messageId);
};

const storyState = (engine: StoryEngine) => {
  const state = engine.serialize();
  return { active: state.activeCheckpointId, path: state.visitedPath, anchors: state.visitedAnchors, values: state.blackboard.values };
};

const cutKind = (cut: SimMessage) => (cut.is_system ? "tool invocation" : cut.is_user ? "player message" : "reply");

const measure = async (fold: FoldVerdict | null) => {
  let pairs = 0;
  const cuts: Record<string, number> = {};
  const divergent: Array<{ seed: number; chat: number; cut: number; kind: string; rollback: unknown; replay: unknown }> = [];
  for (const seed of SEEDS) {
    const next = rng(seed);
    for (let chat = 0; chat < CHATS_PER_SEED; chat += 1) {
      const sim = generateChat(next);
      const full = await play(sim, sim.messages.length, fold);
      for (let cut = 1; cut < sim.messages.length; cut += 1) {
        const rolled = new StoryEngine({ now: () => 0 });
        rolled.loadStory(STORY);
        rolled.hydrate(full.serialize(), full.serializeHistory());
        rollback(rolled, cut);
        const replayed = await play(sim, cut, fold);
        pairs += 1;
        cuts[cutKind(sim.messages[cut])] = (cuts[cutKind(sim.messages[cut])] ?? 0) + 1;
        const left = storyState(rolled);
        const right = storyState(replayed);
        if (JSON.stringify(left) !== JSON.stringify(right)) divergent.push({ seed, chat, cut, kind: cutKind(sim.messages[cut]), rollback: left, replay: right });
      }
    }
  }
  return { pairs, cuts, divergent };
};

describe("SP10 Q3: a folded tool turn keeps rollback ≡ replay (4 seeds)", () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it("control arm: with the fold off, every cut rolls back to what a replay of the surviving messages commits", async () => {
    const result = await measure(null);
    expect({ pairs: result.pairs, cuts: result.cuts, divergent: result.divergent.length, first: result.divergent[0] ?? null })
      .toEqual({ pairs: 23066, cuts: { "player message": 6394, reply: 10954, "tool invocation": 5718 }, divergent: 0, first: null });
  }, 600000);

  it("fold arm, the recorded measurement (predeclared bar: 0 divergent; measured FAIL, see 09-sp10-spike-report.md)", async () => {
    const result = await measure(toolTurnVerdict);
    const byKind = result.divergent.reduce<Record<string, number>>((acc, row) => {
      acc[row.kind] = (acc[row.kind] ?? 0) + 1;
      return acc;
    }, {});
    const first = result.divergent[0];
    expect({ pairs: result.pairs, divergent: result.divergent.length, byKind, first: first && { seed: first.seed, chat: first.chat, cut: first.cut, rollback: first.rollback, replay: first.replay } })
      .toEqual({
        pairs: 23066,
        divergent: 2684,
        byKind: { "tool invocation": 2684 },
        first: {
          seed: 1,
          chat: 0,
          cut: 3,
          rollback: { active: "c0", path: ["c0"], anchors: ["c0"], values: {} },
          replay: { active: "c1", path: ["c0", "c1"], anchors: ["c0"], values: { clue: 1 } },
        },
      });
  }, 600000);
});
