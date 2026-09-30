import { EffectsApplier } from "./effectsApplier";
import { generationWatch } from "./generationWatch";
import { mintToken, tokenMatches, type RunContext, type RunOwnership, type RunToken } from "./runToken";

type Row = { mes: string };

const st = {
  chatId: "chat-a",
  chat: [] as Row[],
  processor: null as FakeStream | null,
  tokens: new Set<() => void>(),
  moves: new Set<() => void>(),
  saves: [] as Array<{ chatId: string; rows: string[] }>,
  generating: false,
  settled: 0,
  opened: 0,
  global: new AbortController(),
  respond: null as ((text: string) => void) | null,
  finished: null as Promise<void> | null,
};

class FakeStream {
  messageId = -1;
  isStopped = false;
  isFinished = false;
  abortController = new AbortController();

  async onProgressStreaming(messageId: number, text: string) {
    st.chat[messageId].mes = text;
  }

  onStopStreaming() {
    this.abortController.abort();
    this.isFinished = true;
  }
}

const response = (signal: AbortSignal) => new Promise<string>((resolve, reject) => {
  st.respond = resolve;
  signal.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
});

const saveReply = (text: string) => {
  st.chat.push({ mes: text });
  return st.chat.length - 1;
};

const nonStreamingReply = async () => {
  st.global = new AbortController();
  st.generating = true;
  st.opened += 1;
  try {
    const text = await response(st.global.signal);
    saveReply(text);
    st.saves.push({ chatId: st.chatId, rows: st.chat.map((row) => row.mes) });
  } catch {
    return;
  } finally {
    st.generating = false;
  }
};

const lateHeadersReply = async () => {
  const processor = new FakeStream();
  st.processor = processor;
  st.generating = true;
  st.opened += 1;
  try {
    const first = await response(processor.abortController.signal);
    if (processor.isStopped) return;
    processor.messageId = saveReply("...");
    for (const listener of [...st.tokens]) await listener();
    await processor.onProgressStreaming(processor.messageId, first);
    processor.isFinished = true;
    await processor.onProgressStreaming(processor.messageId, first);
    st.saves.push({ chatId: st.chatId, rows: st.chat.map((row) => row.mes) });
  } catch {
    return;
  } finally {
    st.generating = false;
  }
};

let mode: "non-streaming" | "late-headers" = "non-streaming";

jest.mock("@services/STAPI", () => ({
  settingsAreLoaded: () => true,
  settingsReady: async () => {},
  getContext: () => ({ chat: st.chat, chatId: st.chatId, extensionSettings: {}, chatMetadata: {} }),
  getActiveGroup: () => null,
  isHostGenerating: () => st.generating,
  stopHostGeneration: () => {
    st.global.abort();
    st.processor?.onStopStreaming();
    return { ok: true, stopped: true };
  },
  guardHostStream: (chatId: string) => jest.requireActual("@services/stHost/streamGuard").guardStreamToChat(chatId, {
    processor: () => st.processor,
    chatId: () => st.chatId,
    chat: () => st.chat,
    onToken: (listener: () => void) => {
      st.tokens.add(listener);
      return () => st.tokens.delete(listener);
    },
    settle: () => { st.settled += 1; },
  }),
  watchHostChatMove: (chatId: string, onMoved: () => void) => jest.requireActual("@services/stHost/streamGuard").watchChatMove(chatId, {
    chatId: () => st.chatId,
    subscribe: (listener: () => void) => {
      st.moves.add(listener);
      return () => st.moves.delete(listener);
    },
  }, onMoved),
  executeSlashCommands: (command: string) => {
    if (!command.startsWith("/trigger")) return Promise.resolve(true);
    st.finished = mode === "non-streaming" ? nonStreamingReply() : lateHeadersReply();
    return st.finished.then(() => true, () => false);
  },
}));

const checkpoint = {
  id: "cp-2",
  name: "The Gate",
  effects: { npc_replies: [{ trigger: "onEnter", member: "narrator", kind: "llm" }] },
} as never;

function harness() {
  let current: RunContext = { chatId: "chat-a", storyId: "s1", playedVersion: 1, sessionEpoch: 1, windowRevision: 0, lowestMutatedMessageId: null };
  let aborter = new AbortController();
  const ownership: RunOwnership = {
    mint: (window = null) => mintToken(current, window),
    check: (token: RunToken) => tokenMatches(current, token),
    signal: () => aborter.signal,
  };
  const extras = { firedNpcReplies: {}, lastSelfInjectionMessageId: -1, ui: {}, requirements: { ready: true } } as never;
  const tick = () => [...st.moves].forEach((listener) => listener());
  const switchAndLoad = () => {
    st.chat.length = 0;
    st.chatId = "chat-b";
    tick();
    st.chat.splice(0, st.chat.length, { mes: "b0 greeting" }, { mes: "b1 the player's own line" }, { mes: "b2 reply" });
    tick();
  };
  const chatChanged = () => {
    current = { ...current, chatId: "chat-b", sessionEpoch: current.sessionEpoch + 1 };
    const old = aborter;
    aborter = new AbortController();
    old.abort();
  };
  return { applier: new EffectsApplier(ownership), extras, switchAndLoad, chatChanged };
}

const flush = async (rounds = 20) => {
  for (let index = 0; index < rounds; index += 1) await Promise.resolve();
};

const requested = async () => {
  for (let index = 0; index < 50 && !st.respond; index += 1) await Promise.resolve();
  if (!st.respond) throw new Error("the /trigger never sent its request");
  return st.respond;
};

const chatB = () => ({ page: st.chat.map((row) => row.mes), saved: st.saves.filter((save) => save.chatId === "chat-b") });
const untouchedB = ["b0 greeting", "b1 the player's own line", "b2 reply"];

let detach: () => void = () => undefined;
beforeEach(() => {
  mode = "non-streaming";
  st.chatId = "chat-a";
  st.chat.splice(0, st.chat.length, { mes: "a0 greeting" });
  st.processor = null;
  st.tokens.clear();
  st.moves.clear();
  st.saves = [];
  st.generating = false;
  st.settled = 0;
  st.opened = 0;
  st.respond = null;
  st.finished = null;
  detach = generationWatch.attach(() => st.opened);
});
afterEach(() => detach());

describe("v2.6 plan 04 C1r: an llm NPC reply that answers after the next chat loaded, before CHAT_CHANGED", () => {
  it("a NON-streaming reply (saveReply appends into the open chat, script.js:5531) does not land in the next chat", async () => {
    const h = harness();
    const firing = h.applier.fireNpcReplies(checkpoint, h.extras, "onEnter");
    const respond = await requested();
    h.switchAndLoad();
    respond("Hello, traveller");
    await flush();
    h.chatChanged();
    await firing;
    expect(chatB()).toEqual({ page: untouchedB, saved: [] });
  });

  it("a streaming reply whose headers arrive after the switch (onStartStreaming pushes its placeholder, :3633) does not land", async () => {
    mode = "late-headers";
    const h = harness();
    const firing = h.applier.fireNpcReplies(checkpoint, h.extras, "onEnter");
    const respond = await requested();
    h.switchAndLoad();
    respond("Hello, traveller");
    await flush();
    h.chatChanged();
    await firing;
    expect(chatB()).toEqual({ page: untouchedB, saved: [] });
  });

  it("control: a non-streaming reply in a chat that did not move lands and is saved once", async () => {
    const h = harness();
    const firing = h.applier.fireNpcReplies(checkpoint, h.extras, "onEnter");
    const respond = await requested();
    respond("Hello, traveller");
    await firing;
    expect({ page: st.chat.map((row) => row.mes), saves: st.saves }).toEqual({
      page: ["a0 greeting", "Hello, traveller"],
      saves: [{ chatId: "chat-a", rows: ["a0 greeting", "Hello, traveller"] }],
    });
  });

  it("control: a streaming reply in a chat that did not move lands and is saved once", async () => {
    mode = "late-headers";
    const h = harness();
    const firing = h.applier.fireNpcReplies(checkpoint, h.extras, "onEnter");
    const respond = await requested();
    respond("Hello, traveller");
    await firing;
    expect({ page: st.chat.map((row) => row.mes), saves: st.saves, settled: st.settled }).toEqual({
      page: ["a0 greeting", "Hello, traveller"],
      saves: [{ chatId: "chat-a", rows: ["a0 greeting", "Hello, traveller"] }],
      settled: 0,
    });
  });
});
