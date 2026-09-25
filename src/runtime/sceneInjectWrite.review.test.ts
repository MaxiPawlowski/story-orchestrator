// AE-04 (external review, 2026-09-25): `scene|beforeHostWrite` cited a story that switches the block
// off, which injects no failure. Here the tracker's host write is refused, the way the runtime's
// inject answers when setStoryExtensionPrompt cannot write (runtime/index.ts, stHost/extensionPrompts.ts).

import { SceneCoordinator } from "./coordinators/sceneCoordinator";
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
  title: "S",
  checkpointById: { cp1: { id: "cp1", name: "The Hall", objective: "Look around" } },
  qualityByKey: {},
  roster: [],
  scene_read: { locations: ["the hall", "the road"], times: ["night"] },
  outgoingByCheckpoint: {},
} as never;

const state = { activeCheckpointId: "cp1", boundary: 3, lastMessageId: 9 } as never;

type Write = { ok: true; changed: boolean } | { ok: false; reason: string };

function harness(answer: (attempt: number) => Write, host?: { held: string | null }) {
  const current: RunContext = { chatId: "chat-a", storyId: "s1", playedVersion: 1, sessionEpoch: 1, windowRevision: 0, lowestMutatedMessageId: null };
  const ownership: RunOwnership = { mint: (window = null) => mintToken(current, window), check: (token: RunToken) => tokenMatches(current, token) };
  let scene: { facts?: { location?: string | null } } | null = null;
  const writes: Array<string | null> = [];
  const journal: Array<{ summary: string; note: string }> = [];
  const coordinator = new SceneCoordinator({
    judge: () => ({
      active: () => true,
      ask: async () => ({ answers: { location: { type: "choice", choice: "the road", confidence: 0.95 }, time: { type: "choice", choice: "night", confidence: 0.9 } }, model: "jev" }),
    }) as never,
    getStory: () => story,
    getState: () => state,
    getWindow: () => [{ speaker: "Player", text: "We walk on." }],
    getPlayerName: () => "Max",
    getLastMessageId: () => 9,
    getScene: () => scene as never,
    setScene: (next: unknown) => { scene = next as typeof scene; },
    inject: ((text: string | null) => { writes.push(text); const result = answer(writes.length); if (host && result.ok) host.held = text; return result; }) as never,
    ...(host ? { applied: () => host.held } : {}),
    journal: (summary: string, note: string) => { journal.push({ summary, note }); },
    ownership,
    now: () => 0,
  } as never);
  const run = () => coordinator.run({ boundary: 3, messageId: 9, heuristicFired: false, scheduleRead: () => {} } as never);
  return { coordinator, run, writes, journal, stored: () => scene };
}

const refusedOnce = (attempt: number): Write => (attempt === 1 ? { ok: false, reason: "this build exposes no setExtensionPrompt, so the block never reaches a prompt" } : { ok: true, changed: true });

control("AE-04 scene|beforeHostWrite: a refused tracker write does not lose the read it came from", async () => {
  const h = harness(refusedOnce);
  await h.run();
  expect(h.writes).toHaveLength(1);
  expect(h.writes[0]).toContain("the road");
  expect(h.stored()?.facts?.location).toBe("the road");
});

control("AE-04 scene|beforeHostWrite: a tracker write that lands is made once, and a later sync does not repeat it", async () => {
  const h = harness(() => ({ ok: true, changed: true }));
  await h.run();
  h.coordinator.sync();
  expect(h.writes).toHaveLength(1);
  expect(h.writes[0]).toContain("the road");
});

finding("AE04-S1", async () => {
  const h = harness(refusedOnce);
  await h.run();
  h.coordinator.sync();
  must(
    h.writes.length === 2 && h.writes[1] === h.writes[0],
    `the scene tracker block the host refused was recorded as injected: ${h.writes.length} write attempt(s) after a refusal and a later sync, so the block never reaches the prompt and nothing retries it`,
  );
});

test("AE04-S1: a refused tracker write is journaled with the host's reason, once, while every sync retries it", async () => {
  const h = harness(() => ({ ok: false, reason: "this build exposes no setExtensionPrompt, so the block never reaches a prompt" }));
  await h.run();
  h.coordinator.sync();
  h.coordinator.sync();
  expect(h.writes).toHaveLength(3);
  expect(h.journal).toEqual([{ summary: "The scene tracker was not added to the prompt", note: expect.stringContaining("exposes no setExtensionPrompt") }]);
});

test("AE04-S1: a tracker write that lands after a refusal is not journaled again, and is not repeated", async () => {
  const h = harness(refusedOnce);
  await h.run();
  h.coordinator.sync();
  h.coordinator.sync();
  expect(h.writes).toHaveLength(2);
  expect(h.journal).toHaveLength(1);
});

// v2.4 acceptance A1 (2026-09-25): ST's clearChat reassigns `extension_prompts = {}` on every chat load,
// a same-chat reload included (script.js:1590, 1712). A tracker that remembers what it wrote claims a
// block the host no longer holds; the runtime wires `applied` to what the host holds.
test("A1: a tracker block ST dropped on a chat load is written again by the next sync", async () => {
  const host = { held: null as string | null };
  const h = harness(() => ({ ok: true, changed: true }), host);
  await h.run();
  expect(host.held).toContain("the road");
  host.held = null;
  h.coordinator.sync();
  expect(h.writes).toHaveLength(2);
  expect(host.held).toContain("the road");
});

test("A1 control: while the host still holds the tracker block, a sync writes nothing", async () => {
  const host = { held: null as string | null };
  const h = harness(() => ({ ok: true, changed: true }), host);
  await h.run();
  h.coordinator.sync();
  h.coordinator.sync();
  expect(h.writes).toHaveLength(1);
});
