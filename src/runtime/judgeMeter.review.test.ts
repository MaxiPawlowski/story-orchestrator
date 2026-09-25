import { JudgeRuntime } from "@runtime/judge";
import { appendJudgeCall, choice, createJudgeRuntime, type JudgeCallRecord, type JudgeRuntimeState } from "@judge/index";
import { mintToken, tokenMatches, type RunContext, type RunToken } from "./runToken";
import { RunOwner } from "./runOwner";

jest.mock("@services/STAPI", () => ({
  settingsAreLoaded: () => true,
  settingsReady: async () => {},
  getContext: () => ({ chat: [], extensionSettings: {} }),
}));

const request = { state: { scene: "the hall" }, questions: { where: choice("Where is the party?", { hall: "in the hall", road: "on the road" }) } };

function harness({ usage = { input_tokens: 296, output_tokens: 20 } as Record<string, number> | undefined } = {}) {
  const chats: Record<string, JudgeRuntimeState> = { "chat-a": createJudgeRuntime(), "chat-b": createJudgeRuntime() };
  const recorded: Array<{ chat: string; record: JudgeCallRecord }> = [];
  const world = { chatId: "chat-a", storyId: "s1" };
  let gate: Promise<void> | null = null;
  let open: () => void = () => {};
  const ctx = (): RunContext => ({ chatId: world.chatId, storyId: world.storyId, playedVersion: 1, sessionEpoch: 1, windowRevision: 0, lowestMutatedMessageId: null });
  const runtime = new JudgeRuntime({
    getSettings: () => ({ enabled: true, model: "jev-1.13.0", timeoutMs: 5000, uses: {}, expansion: { variants: 1, temperature: 0.7, pick: "code" } }) as never,
    transport: (async (asked: { state: Record<string, unknown> }) => {
      if (gate) await gate;
      return { model: "jev-1.13.0", answers: { where: { type: "choice" as const, choice: "hall", confidence: 0.9, probabilities: { hall: 0.9, road: 0.1 } } }, ...(usage ? { usage: { ...usage, input_tokens: (usage.input_tokens ?? 0) + JSON.stringify(asked.state).length } } : {}) };
    }) as never,
    status: async () => ({ configured: true }),
    record: (record: JudgeCallRecord) => {
      recorded.push({ chat: world.chatId, record });
      chats[world.chatId] = appendJudgeCall(chats[world.chatId], record);
    },
    context: () => ({ boundary: 3, messageId: 8 }),
    ownership: { mint: (window?: { from: number; to: number } | null) => mintToken(ctx(), window ?? null), check: (token: RunToken) => tokenMatches(ctx(), token) },
    now: () => 0,
  } as never);
  return {
    runtime, chats, recorded, world,
    holdNext: () => { gate = new Promise<void>((resolve) => { open = resolve; }); },
    release: () => { gate = null; open(); },
  };
}

describe("T24: a judge call records what it cost (v2.4 plan 07)", () => {
  it("stamps the usage on the ring row and adds it to the chat's meter", async () => {
    const h = harness();
    await h.runtime.ask("warden", request);
    const tokens = 296 + JSON.stringify(request.state).length;
    expect(h.recorded[0].record).toMatchObject({ use: "warden", inputTokens: tokens, outputTokens: 20 });
    expect(h.recorded[0].record.cached).toBeUndefined();
    expect(h.chats["chat-a"].meter).toEqual({ calls: 1, cachedCalls: 0, inputTokens: tokens, outputTokens: 20, cost: 0 });
  });

  it("a cache hit is recorded as cached and adds no tokens", async () => {
    const h = harness();
    await h.runtime.ask("warden", request);
    await h.runtime.ask("warden", request);
    expect(h.recorded[1].record).toMatchObject({ cached: true, latencyMs: 0 });
    expect(h.recorded[1].record.inputTokens).toBeUndefined();
    expect(h.chats["chat-a"].meter).toMatchObject({ calls: 1, cachedCalls: 1 });
  });

  it("a call discarded in its own chat (the story changed under it) is still charged to that chat, and kept out of its ring", async () => {
    const h = harness();
    h.holdNext();
    const pending = h.runtime.ask("warden", request);
    h.world.storyId = "s2";
    h.release();
    expect((await pending).discarded).toBe("story");
    expect(h.chats["chat-a"].calls).toEqual([]);
    expect(h.chats["chat-a"].meter.calls).toBe(1);
    expect(h.chats["chat-a"].meter.inputTokens).toBeGreaterThan(0);
  });

  it("a call that outlived its chat is charged to the chat that asked, never to the chat that is open", async () => {
    const h = harness();
    h.holdNext();
    const pending = h.runtime.ask("warden", request);
    h.world.chatId = "chat-b";
    h.release();
    expect((await pending).discarded).toBe("chat");
    expect(h.chats["chat-b"].meter.calls).toBe(0);
    await h.runtime.ask("lore", { ...request, state: { scene: "the road" } });
    expect(h.chats["chat-b"].meter.calls).toBe(1);
    expect(h.chats["chat-a"].meter.calls).toBe(0);
    h.world.chatId = "chat-a";
    await h.runtime.ask("lore", { ...request, state: { scene: "the gate" } });
    expect(h.chats["chat-a"].meter.calls).toBe(2);
    expect(h.chats["chat-a"].calls.map((row) => row.use)).toEqual(["lore"]);
    expect(h.chats["chat-b"].meter.calls).toBe(1);
  });

  it("control: a call that stays in its chat is ringed and metered once", async () => {
    const h = harness();
    await h.runtime.ask("warden", request);
    expect(h.chats["chat-a"].calls).toHaveLength(1);
    expect(h.chats["chat-a"].meter.calls).toBe(1);
    expect(h.chats["chat-b"].meter.calls).toBe(0);
  });
});

// AE-04 (external review, 2026-09-25): `judgeRing|aborted` cited the epoch signal and the judge client
// on their own; neither reaches the ring. Here the runtime's own call is cancelled by an epoch change.
describe("AE-04 judgeRing|aborted: a judge call the epoch cancels", () => {
  function epochHarness() {
    const chats: Record<string, JudgeRuntimeState> = { "chat-a": createJudgeRuntime(), "chat-b": createJudgeRuntime() };
    const world = { chatId: "chat-a", storyId: "s1" };
    const owner = new RunOwner({ openChatId: () => world.chatId, storyId: () => world.storyId, playedVersion: () => 1 });
    owner.bump();
    const signals: AbortSignal[] = [];
    const rows: JudgeCallRecord[] = [];
    let answer: (() => void) | null = null;
    const runtime = new JudgeRuntime({
      getSettings: () => ({ enabled: true, model: "jev-1.13.0", timeoutMs: 5000, uses: {}, expansion: { variants: 1, temperature: 0.7, pick: "code" } }) as never,
      transport: ((_request: unknown, options: { signal?: AbortSignal }) => new Promise((resolve, reject) => {
        if (options.signal) signals.push(options.signal);
        answer = () => resolve({ model: "jev-1.13.0", answers: { where: { type: "choice" as const, choice: "hall", confidence: 0.9, probabilities: { hall: 0.9, road: 0.1 } } }, usage: { input_tokens: 300, output_tokens: 20 } });
        options.signal?.addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { name: "AbortError" })));
      })) as never,
      status: async () => ({ configured: true }),
      record: (record: JudgeCallRecord) => { rows.push(record); chats[world.chatId] = appendJudgeCall(chats[world.chatId], record); },
      context: () => ({ boundary: 3, messageId: 8 }),
      ownership: owner.ownership,
      now: () => 0,
    } as never);
    const asked = async () => { for (let index = 0; index < 20 && !signals.length; index += 1) await Promise.resolve(); };
    return { runtime, chats, world, owner, signals, rows, asked, answer: () => answer?.() };
  }

  it("cancels the request, and records it as cancelled, charged to the chat that asked and kept out of its ring", async () => {
    const h = epochHarness();
    const pending = h.runtime.ask("warden", request);
    await h.asked();
    h.world.storyId = "s2";
    h.owner.bump();
    const result = await pending;
    expect(h.signals[0].aborted).toBe(true);
    expect(result).toMatchObject({ answers: null, fallback: "cancelled", discarded: "epoch" });
    expect(h.rows).toEqual([expect.objectContaining({ use: "warden", fallback: "cancelled", discarded: "epoch" })]);
    expect(h.chats["chat-a"].calls).toEqual([]);
    expect(h.chats["chat-a"].meter.calls).toBe(1);
    expect(h.chats["chat-b"].meter.calls).toBe(0);
  });

  it("control: the same call nobody cancels is answered and ringed in its own chat", async () => {
    const h = epochHarness();
    const pending = h.runtime.ask("warden", request);
    await h.asked();
    h.answer();
    const result = await pending;
    expect(h.signals[0].aborted).toBe(false);
    expect(result.fallback).toBeUndefined();
    expect(result.discarded).toBeUndefined();
    expect(h.chats["chat-a"].calls).toEqual([expect.objectContaining({ use: "warden", model: "jev-1.13.0" })]);
    expect(h.chats["chat-a"].calls[0].fallback).toBeUndefined();
  });
});
