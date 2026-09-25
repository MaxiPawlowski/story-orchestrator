// AE-04 (external review, 2026-09-25): `lore|aborted` cited a selection whose chat moved while the
// host was read — before the judge was asked — and a pure judge-client test. Neither hands the
// selector a call that was cancelled. These do: the judge answers `cancelled` because the chat moved
// while it was asked, which is what the epoch signal produces (src/judge/cancelled.review.test.ts).

import { LoreSelector } from "./loreSelect";
import { mintToken, tokenMatches, type RunContext, type RunOwnership, type RunToken } from "./runToken";
import { control, finding, must } from "../../test/findings/ledger";

jest.mock("@services/STAPI", () => ({
  settingsAreLoaded: () => true,
  settingsReady: async () => {},
  observeNextSave: async () => ({ requested: true, status: 200, ok: true, timedOut: false }),
  readServerBoundary: async () => null,
  getContext: () => ({ chat: [], chatId: "chat-a", extensionSettings: {}, chatMetadata: {} }),
  getActiveGroup: () => null,
}));

const story = {
  id: "s1",
  version: 1,
  title: "S",
  lore_select: { lorebooks: ["Book"] },
  checkpointById: { cp1: { id: "cp1", name: "The Hall", objective: "Look around" } },
  qualityByKey: {},
  roster: [],
  outgoingByCheckpoint: {},
} as never;

const state = { activeCheckpointId: "cp1", boundary: 3, lastMessageId: 9 } as never;

const vault = { world: "Book", uid: 1, comment: "the vault", content: "A sealed vault.", disable: false, constant: false };

type Answer = { answers: Record<string, unknown> | null; model: string | null; fallback?: string };

function harness(onAsk: (world: { switchChat(): void }) => Answer) {
  let current: RunContext = { chatId: "chat-a", storyId: "s1", playedVersion: 1, sessionEpoch: 1, windowRevision: 0, lowestMutatedMessageId: null };
  const ownership: RunOwnership = { mint: (window = null) => mintToken(current, window), check: (token: RunToken) => tokenMatches(current, token) };
  const world = {
    switchChat: () => { current = { ...current, chatId: "chat-b", sessionEpoch: current.sessionEpoch + 1 }; },
    returnToChatA: () => { current = { ...current, chatId: "chat-a", sessionEpoch: current.sessionEpoch + 1 }; },
  };
  const forced: unknown[][] = [];
  let asked = 0;
  const selector = new LoreSelector({
    judge: () => ({ active: () => true, ask: async () => { asked += 1; return onAsk(world); } }) as never,
    getStory: () => story,
    getState: () => state,
    getWindow: () => [{ speaker: "Player", text: "We enter." }],
    getChatId: () => current.chatId,
    getLastMessageId: () => 9,
    getEntries: async () => [vault] as never,
    force: async (entries: unknown[]) => { forced.push(entries); return { ok: true as const, entries: entries.length }; },
    ownership,
  } as never);
  return { selector, forced, world, asked: () => asked };
}

const cancelledBySwitch = (world: { switchChat(): void }): Answer => {
  world.switchChat();
  return { answers: null, model: null, fallback: "cancelled" };
};

const picksTheVault = (): Answer => ({ answers: { "e:0": { type: "noul", noul: 0.95 } }, model: "jev" });

control("AE-04 lore|aborted: a lore call cancelled by a chat switch forces nothing into the next prompt", async () => {
  const h = harness(cancelledBySwitch);
  expect(await h.selector.select("MESSAGE_SENT" as never)).toBeNull();
  expect(h.asked()).toBe(1);
  expect(h.forced).toEqual([]);
});

control("AE-04 lore|aborted: the same selection that is not cancelled forces the picked entry", async () => {
  const h = harness(picksTheVault);
  expect(await h.selector.select("MESSAGE_SENT" as never)).toMatchObject({ cached: false, picks: [{ uid: 1 }] });
  expect(h.forced).toEqual([[vault]]);
});

finding("AE04-L1", async () => {
  let calls = 0;
  const h = harness((world) => { calls += 1; return calls === 1 ? cancelledBySwitch(world) : picksTheVault(); });
  await h.selector.select("MESSAGE_SENT" as never);
  h.world.returnToChatA();
  const back = await h.selector.select("MESSAGE_SENT" as never);
  must(
    h.asked() === 2 && h.forced.length === 1,
    `a lore selection cancelled by a chat switch was cached as "the judge picked nothing" and served on return (asked ${h.asked()} time(s), returned ${JSON.stringify(back)}), so the next generation in that chat carried no judged lore`,
  );
});
