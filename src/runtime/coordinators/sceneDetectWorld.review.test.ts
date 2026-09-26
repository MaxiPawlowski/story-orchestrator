// v2.4 acceptance A10 (2026-09-25, J12). The scene-break heuristic compares the cast and location
// at this boundary with the ones it saw last, and that cursor lived for the page, not the chat. A
// new chat's first boundary was therefore compared with the previous chat's last one: J12 run1
// (after J11's group), run2 and seriesB-run3 (after a run that ended at road-to-wendhope, where
// Tobias is disabled, while guild-hall re-enables him) each opened with a `scene:cast` read over
// messages 0-1, a read spent before the player had decided anything.

import { ExtractionCoordinator } from "./extractionCoordinator";
import { mintToken, tokenMatches, type RunContext, type RunOwnership, type RunToken } from "../runToken";
import { control, finding, must } from "../../../test/findings/ledger";
import { testOwnership } from "../../../test/findings/testOwnership";

const host: { group: { members: string[]; disabled_members: string[] } | null; chat: Array<{ name: string; mes: string; is_user: boolean }> } = {
  group: null,
  chat: [{ name: "Tobias", mes: "The Wendhope posting pays in silver.", is_user: false }],
};

jest.mock("@services/STAPI", () => ({
  settingsAreLoaded: () => true,
  settingsReady: async () => {},
  observeNextSave: async () => ({ requested: true, status: 200, ok: true, timedOut: false }),
  readServerBoundary: async () => null,
  getContext: () => ({ chat: host.chat, chatId: "chat-a", extensionSettings: {}, chatMetadata: {} }),
  getActiveGroup: () => host.group,
}));

const full = { members: ["belle.png", "dalan.png", "tobias.png"], disabled_members: [] };
const withoutTobias = { members: ["belle.png", "dalan.png", "tobias.png"], disabled_members: ["tobias.png"] };

function harness(owned = true) {
  let current: RunContext = { chatId: "chat-a", storyId: "adolion-adventurer", playedVersion: 6, sessionEpoch: 1, windowRevision: 0, lowestMutatedMessageId: null };
  const ownership: RunOwnership = {
    mint: (window = null) => mintToken(current, window),
    check: (token: RunToken) => tokenMatches(current, token),
  };
  let location: string | undefined;
  const coordinator = new ExtractionCoordinator({
    getStory: () => ({ title: "Adolion", qualityByKey: {}, checkpointById: {}, roster: [] }),
    getState: () => ({ activeCheckpointId: "guild-hall", boundary: 1, blackboard: { values: location === undefined ? {} : { location } } }),
    memory: { enabled: true },
    ownership: owned ? ownership : testOwnership(),
  } as never);
  return {
    detect: () => coordinator.detectSceneBreak(),
    newChat: () => { current = { ...current, chatId: "chat-b", sessionEpoch: current.sessionEpoch + 1 }; },
    moveTo: (next: string) => { location = next; },
  };
}

beforeEach(() => { host.group = null; });

finding("ACC-A10", () => {
  const h = harness();
  host.group = withoutTobias;
  h.detect();
  h.newChat();
  host.group = full;
  const first = h.detect();
  must(!first?.hit, `the first boundary of a new chat read a cast change against another chat's cast (${JSON.stringify(first)})`);

  const placed = harness();
  placed.moveTo("the road");
  placed.detect();
  placed.newChat();
  placed.moveTo("the guild hall");
  const arrived = placed.detect();
  must(!arrived?.hit, `the first boundary of a new chat read a location change against another chat's location (${JSON.stringify(arrived)})`);
});

control("A10: a cast change inside one chat is still a scene break", () => {
  const h = harness();
  host.group = full;
  h.detect();
  host.group = withoutTobias;
  expect(h.detect()).toMatchObject({ hit: true, reason: "cast" });
});

control("A10: a location change inside one chat is still a scene break", () => {
  const h = harness();
  h.moveTo("the guild hall");
  h.detect();
  h.moveTo("the road");
  expect(h.detect()).toMatchObject({ hit: true, reason: "location" });
});

control("A10: after a new chat's first boundary, its own cast changes are breaks again", () => {
  const h = harness();
  host.group = withoutTobias;
  h.detect();
  h.newChat();
  host.group = full;
  h.detect();
  host.group = withoutTobias;
  expect(h.detect()).toMatchObject({ hit: true, reason: "cast" });
});

control("A10: an unowned coordinator keeps comparing across calls", () => {
  const h = harness(false);
  host.group = full;
  h.detect();
  host.group = withoutTobias;
  expect(h.detect()).toMatchObject({ hit: true, reason: "cast" });
});
