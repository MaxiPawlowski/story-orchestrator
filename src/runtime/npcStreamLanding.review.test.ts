import { EffectsApplier } from "./effectsApplier";
import { generationWatch } from "./generationWatch";
import { mintToken, tokenMatches, type RunContext, type RunOwnership, type RunToken } from "./runToken";

type Row = { mes: string };

const st = {
  chatId: "chat-a",
  chat: [] as Row[],
  processor: null as FakeStream | null,
  tokens: new Set<() => void>(),
  saves: [] as Array<{ chatId: string; rows: string[] }>,
  generating: false,
  settled: 0,
  opened: 0,
  feed: null as Feed | null,
  finished: null as Promise<void> | null,
};

class Feed {
  private queue: Array<string | null> = [];
  private wake: (() => void) | null = null;
  constructor(private readonly signal: AbortSignal) {
    signal.addEventListener("abort", () => this.wake?.());
  }
  push(value: string | null) {
    this.queue.push(value);
    this.wake?.();
  }
  async *read() {
    let text = "";
    for (;;) {
      while (!this.queue.length) {
        if (this.signal.aborted) throw new Error("aborted");
        await new Promise<void>((resolve) => { this.wake = resolve; });
        this.wake = null;
      }
      if (this.signal.aborted) throw new Error("aborted");
      const next = this.queue.shift();
      if (next === null || next === undefined) return;
      text += next;
      yield text;
    }
  }
}

class FakeStream {
  messageId = -1;
  isStopped = false;
  isFinished = false;
  result = "";
  abortController = new AbortController();

  async onProgressStreaming(messageId: number, text: string) {
    st.chat[messageId].mes = text;
  }

  onStopStreaming() {
    this.abortController.abort();
    this.isFinished = true;
  }

  async generate(feed: Feed) {
    try {
      for await (const text of feed.read()) {
        if (this.isStopped || this.abortController.signal.aborted) return this.result;
        this.result = text;
        for (const listener of [...st.tokens]) await listener();
        await this.onProgressStreaming(this.messageId, text);
      }
    } catch {
      if (!this.isFinished) this.isStopped = true;
      return this.result;
    }
    this.isFinished = true;
    return this.result;
  }
}

const streamReply = async () => {
  const processor = new FakeStream();
  st.processor = processor;
  st.generating = true;
  st.opened += 1;
  const feed = new Feed(processor.abortController.signal);
  st.feed = feed;
  st.chat.push({ mes: "..." });
  processor.messageId = st.chat.length - 1;
  const text = await processor.generate(feed);
  try {
    if (!processor.isStopped && processor.isFinished) {
      await processor.onProgressStreaming(processor.messageId, text);
      st.saves.push({ chatId: st.chatId, rows: st.chat.map((row) => row.mes) });
    }
  } finally {
    st.generating = false;
  }
};

jest.mock("@services/STAPI", () => ({
  settingsAreLoaded: () => true,
  settingsReady: async () => {},
  getContext: () => ({ chat: st.chat, chatId: st.chatId, extensionSettings: {}, chatMetadata: {} }),
  getActiveGroup: () => null,
  isHostGenerating: () => st.generating,
  stopHostGeneration: () => {
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
  executeSlashCommands: (command: string) => {
    if (!command.startsWith("/trigger")) return Promise.resolve(true);
    st.finished = streamReply();
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
  const populate = () => {
    st.chatId = "chat-b";
    st.chat.splice(0, st.chat.length, { mes: "b0 greeting" }, { mes: "b1 the player's own line" }, { mes: "b2 reply" });
  };
  const chatChanged = () => {
    current = { ...current, chatId: "chat-b", sessionEpoch: current.sessionEpoch + 1 };
    const old = aborter;
    aborter = new AbortController();
    old.abort();
  };
  return { applier: new EffectsApplier(ownership), extras, populate, chatChanged };
}

const tick = async (rounds = 20) => {
  for (let index = 0; index < rounds; index += 1) await Promise.resolve();
};

const started = async () => {
  for (let index = 0; index < 50 && !st.feed; index += 1) await Promise.resolve();
  if (!st.feed) throw new Error("the /trigger never started");
  return st.feed;
};

const chatB = () => ({ page: st.chat.map((row) => row.mes), saved: st.saves.filter((save) => save.chatId === "chat-b") });

let detach: () => void = () => undefined;
beforeEach(() => {
  st.chatId = "chat-a";
  st.chat.splice(0, st.chat.length, { mes: "a0 greeting" });
  st.processor = null;
  st.tokens.clear();
  st.saves = [];
  st.generating = false;
  st.settled = 0;
  st.opened = 0;
  st.feed = null;
  st.finished = null;
  detach = generationWatch.attach(() => st.opened);
});
afterEach(() => detach());

const untouchedB = ["b0 greeting", "b1 the player's own line", "b2 reply"];

describe("v2.5 C1 (D1): an llm NPC /trigger reply never lands in the chat the player switched to", () => {
  it("a switch mid-stream leaves the populated next chat untouched in memory and unsaved (tokens after the load, CHAT_CHANGED later)", async () => {
    const h = harness();
    const firing = h.applier.fireNpcReplies(checkpoint, h.extras, "onEnter");
    const feed = await started();
    feed.push("Hello");
    await tick();
    h.populate();
    feed.push(" there");
    await tick();
    h.chatChanged();
    feed.push(", traveller");
    feed.push(null);
    await firing;
    expect(chatB()).toEqual({ page: untouchedB, saved: [] });
  });

  it("a switch after the last token (the natural finish) still writes and saves nothing in the next chat", async () => {
    const h = harness();
    const firing = h.applier.fireNpcReplies(checkpoint, h.extras, "onEnter");
    const feed = await started();
    feed.push("Hello");
    await tick();
    h.populate();
    feed.push(null);
    await st.finished?.catch(() => undefined);
    h.chatChanged();
    await firing;
    expect(chatB()).toEqual({ page: untouchedB, saved: [] });
  });

  it("a switch before the first token does not turn the stop into a finish that saves the next chat", async () => {
    const h = harness();
    const firing = h.applier.fireNpcReplies(checkpoint, h.extras, "onEnter");
    const feed = await started();
    h.populate();
    h.chatChanged();
    await tick();
    feed.push("Hello");
    feed.push(null);
    await firing;
    expect(chatB()).toEqual({ page: untouchedB, saved: [] });
  });

  it("a halted reply gives the send button back, once", async () => {
    const h = harness();
    const firing = h.applier.fireNpcReplies(checkpoint, h.extras, "onEnter");
    const feed = await started();
    feed.push("Hello");
    await tick();
    h.populate();
    h.chatChanged();
    feed.push(null);
    await firing;
    expect(st.settled).toBe(1);
  });

  it("control: a reply in a chat that did not move streams, lands and is saved exactly as before", async () => {
    const h = harness();
    const firing = h.applier.fireNpcReplies(checkpoint, h.extras, "onEnter");
    const feed = await started();
    feed.push("Hello");
    feed.push(" there");
    feed.push(null);
    await firing;
    expect({ page: st.chat.map((row) => row.mes), saves: st.saves, settled: st.settled }).toEqual({
      page: ["a0 greeting", "Hello there"],
      saves: [{ chatId: "chat-a", rows: ["a0 greeting", "Hello there"] }],
      settled: 0,
    });
  });
});
