import { EffectsApplier } from "./effectsApplier";
import { mintToken, tokenMatches, type RunContext, type RunOwnership, type RunToken } from "./runToken";

const spoken: string[] = [];
const host = {
  chat: [{ mes: "hello" }] as { mes: string }[],
  member: { ok: false, reason: "two group members are named Dup" } as { ok: true; position: number } | { ok: false; reason: string },
  slashOk: true,
};

jest.mock("@services/STAPI", () => ({
  settingsAreLoaded: () => true,
  settingsReady: async () => {},
  observeNextSave: async () => ({ requested: true, status: 200, ok: true, timedOut: false }),
  readServerBoundary: async () => null,
  getContext: () => ({ chat: host.chat, chatId: "chat-a", extensionSettings: {}, chatMetadata: {}, name1: "Player" }),
  getActiveGroup: () => null,
  watchHostChatMove: () => () => undefined,
  guardHostStream: () => ({ halt: () => false, release: () => undefined }),
  groupMemberPosition: () => host.member,
  isHostGenerating: () => false,
  startGroupVoiceAt: async (position: number) => {
    spoken.push(`voice ${position}`);
    host.chat.push({ mes: "reply" });
    return { ok: true };
  },
  executeSlashCommands: async (command: string) => {
    if (!host.slashOk) return false;
    spoken.push(command);
    host.chat.push({ mes: "reply" });
    return true;
  },
}));

const journal: string[] = [];
const harness = () => {
  const current: RunContext = { chatId: "chat-a", storyId: "s1", storyHash: "h1", sessionEpoch: 1, windowRevision: 0, lowestMutatedMessageId: null };
  const ownership: RunOwnership = { mint: (window = null) => mintToken(current, window), check: (token: RunToken) => tokenMatches(current, token) };
  const extras = { firedNpcReplies: {} as Record<string, number>, firedNpcRepliesAt: {} as Record<string, number[]>, lastSelfInjectionMessageId: -1 };
  return { applier: new EffectsApplier(ownership, { journal: (line: string) => journal.push(line) } as never), extras };
};

const checkpoint = (kind: "generated" | "scripted") => ({
  id: "cp-1",
  name: "The Gate",
  effects: { npc_replies: [{ trigger: "afterSpeak", member: "Dup", kind, text: "Dup speaks.", maxTriggers: 1 }] },
}) as never;

beforeEach(() => {
  spoken.length = 0;
  journal.length = 0;
  host.chat = [{ mes: "hello" }, { mes: "player line" }];
  host.member = { ok: false, reason: "two group members are named Dup" };
  host.slashOk = true;
});

describe("review 2026-10-16 #6: a refused NPC reply does not consume its trigger allowance", () => {
  it("an ambiguous member refuses, leaves maxTriggers and the self-injection mark untouched, and the corrected next turn fires", async () => {
    const h = harness();
    expect(await h.applier.fireNpcReplies(checkpoint("generated"), h.extras as never, "afterSpeak")).toBe(0);
    expect(h.extras.firedNpcReplies).toEqual({});
    expect(h.extras.firedNpcRepliesAt).toEqual({});
    expect(h.extras.lastSelfInjectionMessageId).toBe(-1);
    expect(journal.some((line) => line.includes("was not triggered"))).toBe(true);
    host.member = { ok: true, position: 2 };
    host.chat.push({ mes: "next player line" });
    expect(await h.applier.fireNpcReplies(checkpoint("generated"), h.extras as never, "afterSpeak")).toBe(1);
    expect(spoken).toEqual(["voice 2"]);
    expect(h.extras.firedNpcReplies).toEqual({ "cp-1:afterSpeak:Dup:0": 1 });
    expect(h.extras.lastSelfInjectionMessageId).toBe(host.chat.length - 1);
  });

  it("a refused /sendas is a refusal too: fireReply carries the slash result instead of always answering wrote", async () => {
    const h = harness();
    host.slashOk = false;
    expect(await h.applier.fireNpcReplies(checkpoint("scripted"), h.extras as never, "afterSpeak")).toBe(0);
    expect(h.extras.firedNpcReplies).toEqual({});
    expect(h.extras.lastSelfInjectionMessageId).toBe(-1);
    host.slashOk = true;
    expect(await h.applier.fireNpcReplies(checkpoint("scripted"), h.extras as never, "afterSpeak")).toBe(1);
    expect(h.extras.firedNpcReplies).toEqual({ "cp-1:afterSpeak:Dup:0": 1 });
  });

  it("control: a reply that lands consumes its allowance and marks the self-injection, so it never fires twice", async () => {
    const h = harness();
    host.member = { ok: true, position: 2 };
    expect(await h.applier.fireNpcReplies(checkpoint("generated"), h.extras as never, "afterSpeak")).toBe(1);
    host.chat.push({ mes: "next player line" });
    expect(await h.applier.fireNpcReplies(checkpoint("generated"), h.extras as never, "afterSpeak")).toBe(0);
    expect(spoken).toHaveLength(1);
  });
});
