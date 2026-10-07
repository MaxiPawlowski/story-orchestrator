import { EffectsApplier } from "./effectsApplier";
import { mintToken, tokenMatches, type RunContext, type RunOwnership, type RunToken } from "./runToken";

const spoken: string[] = [];

jest.mock("@services/STAPI", () => ({
  settingsAreLoaded: () => true,
  settingsReady: async () => {},
  getContext: () => ({ chat: [{ mes: "hello" }], chatId: "chat-a", extensionSettings: {}, chatMetadata: {} }),
  getActiveGroup: () => null,
  executeSlashCommands: async (command: string) => { spoken.push(command); return { pipe: "" }; },
}));

const context: RunContext = { chatId: "chat-a", storyId: "s1", storyHash: "h1", sessionEpoch: 1, windowRevision: 0, lowestMutatedMessageId: null };
const ownership: RunOwnership = { mint: (window = null) => mintToken(context, window), check: (token: RunToken) => tokenMatches(context, token) };

const checkpoint = (probability?: number) => ({
  id: "cp-2",
  name: "The Gate",
  effects: { npc_replies: [{ trigger: "onEnter", member: "corin", kind: "scripted", text: "Corin speaks.", ...(probability === undefined ? {} : { probability }) }] },
}) as never;

const harness = () => {
  const journal: Array<{ summary: string; note?: string }> = [];
  const applier = new EffectsApplier(ownership, { journal: (summary, note) => journal.push({ summary, note }) });
  const extras = { firedNpcReplies: {}, lastSelfInjectionMessageId: -1, ui: {}, requirements: { ready: true } } as never;
  return { applier, extras, journal };
};

describe("C9: an NPC reply's probability roll is journaled", () => {
  beforeEach(() => { spoken.length = 0; });
  afterEach(() => { jest.restoreAllMocks(); });

  it("a lost roll says what was rolled against what, and that nothing was said", async () => {
    jest.spyOn(Math, "random").mockReturnValue(0.8);
    const h = harness();
    await h.applier.fireNpcReplies(checkpoint(0.25), h.extras, "onEnter");
    expect(spoken).toEqual([]);
    expect(h.journal).toEqual([{ summary: "NPC reply corin (onEnter) skipped by its roll", note: "rolled 0.800 against 0.25 at cp-2:onEnter:corin:0" }]);
  });

  it("a won roll says it fired, and the reply is spoken", async () => {
    jest.spyOn(Math, "random").mockReturnValue(0.1);
    const h = harness();
    await h.applier.fireNpcReplies(checkpoint(0.25), h.extras, "onEnter");
    expect(spoken).toHaveLength(1);
    expect(h.journal).toEqual([{ summary: "NPC reply corin (onEnter) fired by its roll", note: "rolled 0.100 against 0.25 at cp-2:onEnter:corin:0" }]);
  });

  it("control: a reply without a probability rolls nothing and journals no roll", async () => {
    const random = jest.spyOn(Math, "random");
    const h = harness();
    await h.applier.fireNpcReplies(checkpoint(), h.extras, "onEnter");
    expect(spoken).toHaveLength(1);
    expect(random).not.toHaveBeenCalled();
    expect(h.journal).toEqual([]);
  });

  it("a roll exactly at the threshold fires, as before", async () => {
    jest.spyOn(Math, "random").mockReturnValue(0.25);
    const h = harness();
    await h.applier.fireNpcReplies(checkpoint(0.25), h.extras, "onEnter");
    expect(spoken).toHaveLength(1);
  });
});

describe("SP7: the roll seam replaces Math.random when it answers", () => {
  beforeEach(() => { spoken.length = 0; });
  afterEach(() => { jest.restoreAllMocks(); });

  const seamed = (roll: (key: string) => number | null) => {
    const journal: Array<{ summary: string; note?: string }> = [];
    const applier = new EffectsApplier(ownership, { journal: (summary, note) => journal.push({ summary, note }), roll });
    const extras = { firedNpcReplies: {}, lastSelfInjectionMessageId: -1, ui: {}, requirements: { ready: true } } as never;
    return { applier, extras, journal };
  };

  it("a seam draw decides the roll and Math.random is never asked", async () => {
    const random = jest.spyOn(Math, "random");
    const keys: string[] = [];
    const h = seamed((key) => { keys.push(key); return 0.9; });
    await h.applier.fireNpcReplies(checkpoint(0.25), h.extras, "onEnter");
    expect(random).not.toHaveBeenCalled();
    expect(keys).toEqual(["cp-2:onEnter:corin:0"]);
    expect(spoken).toEqual([]);
    expect(h.journal[0].note).toBe("rolled 0.900 against 0.25 at cp-2:onEnter:corin:0");
  });

  it("a re-entry that asks the seam the same key gets the same outcome", async () => {
    const h = seamed(() => 0.2);
    await h.applier.fireNpcReplies(checkpoint(0.25), h.extras, "onEnter");
    const again = seamed(() => 0.2);
    await again.applier.fireNpcReplies(checkpoint(0.25), again.extras, "onEnter");
    expect(h.journal).toEqual(again.journal);
  });

  it("control: a seam that answers null falls back to Math.random, as today", async () => {
    jest.spyOn(Math, "random").mockReturnValue(0.1);
    const h = seamed(() => null);
    await h.applier.fireNpcReplies(checkpoint(0.25), h.extras, "onEnter");
    expect(h.journal[0].note).toBe("rolled 0.100 against 0.25 at cp-2:onEnter:corin:0");
  });
});
