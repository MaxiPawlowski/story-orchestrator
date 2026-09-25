// v2.3 plan 03 (S3): the persisted blob now says which chat it belongs to.
//
// `persist()` already declines to WRITE a run into the wrong chat. This is the other half: a read.
// `chat_metadata` belongs to SillyTavern, which swaps it when the chat changes, so a read racing
// that swap was indistinguishable from an ordinary one. That is the v2.1 plan 08 defect seen from
// the reading end — one chat's run turning up in another chat.
//
// Three rules, and the third is the one that is easy to get wrong:
//   1. A blob stamped for this chat is read normally.
//   2. A blob stamped for ANOTHER chat is replaced, not repaired. Adopting its stories would be
//      the same mistake in the opposite direction.
//   3. An UNSTAMPED blob is readable. It predates the field; refusing it would drop the state of
//      every chat that existed before this version, which is data loss dressed up as safety.

import { control, must } from "../../test/findings/ledger";
import { readFileSync } from "node:fs";
import { join } from "node:path";

jest.mock("@services/STAPI", () => ({
  settingsAreLoaded: () => true,
  settingsReady: async () => {},
  observeNextSave: async () => ({ requested: true, status: 200, ok: true, timedOut: false }),
  readServerBoundary: async () => null, getContext: () => globalThis.__blobContext }));
jest.mock("./storyLibrary", () => ({ listStoryRecords: () => [] }));

import { BLOB_VERSION, getMetadataBlob, loadPersistedRuntime, savePersistedRuntime } from "./persistence";
import { migrateV3ToV4 } from "./persistenceMigration";

declare global {
  // eslint-disable-next-line no-var
  var __blobContext: { chatId: string; chatMetadata: Record<string, unknown>; saveMetadata?: () => void };
}

const story = (id: string) => ({ storyId: id, storyTitle: "S", pinnedStory: null, playedVersion: 1, contentHashAtLoad: "h", engineState: null, extras: {} }) as never;

function openChat(chatId: string, blob: unknown) {
  globalThis.__blobContext = { chatId, chatMetadata: blob === undefined ? {} : { story_orchestrator: blob }, saveMetadata: () => {} };
}

control("a blob stamped for this chat is read normally", () => {
  openChat("chat-a", { version: BLOB_VERSION, chatId: "chat-a", selectedStoryId: "s1", stories: { s1: story("s1") } });
  expect(getMetadataBlob().selectedStoryId).toBe("s1");
  expect(loadPersistedRuntime("s1")).not.toBeNull();
});

control("a blob stamped for ANOTHER chat is not read, and its stories are not adopted", () => {
  openChat("chat-b", { version: BLOB_VERSION, chatId: "chat-a", selectedStoryId: "s1", stories: { s1: story("s1") } });
  const blob = getMetadataBlob();
  must(
    blob.selectedStoryId === null && Object.keys(blob.stories).length === 0,
    `chat-b read a blob stamped for chat-a (selected ${String(blob.selectedStoryId)}, ${Object.keys(blob.stories).length} story(ies)) — this is the v2.1 plan 08 defect from the reading end`,
  );
  expect(loadPersistedRuntime("s1")).toBeNull();
  expect(blob.chatId).toBe("chat-b");
});

control("an UNSTAMPED blob is readable, so no pre-v4 chat loses its state", () => {
  // The rule that makes this safe to ship. A blob written before the field existed is legitimate.
  openChat("chat-a", { version: 4, chatId: null, selectedStoryId: "s1", stories: { s1: story("s1") } });
  expect(getMetadataBlob().selectedStoryId).toBe("s1");
  expect(loadPersistedRuntime("s1")).not.toBeNull();
});

control("an unstamped blob takes this chat's id on the first save", () => {
  openChat("chat-a", { version: 4, chatId: null, selectedStoryId: null, stories: {} });
  savePersistedRuntime(story("s1"));
  expect(getMetadataBlob().chatId).toBe("chat-a");
});

control("a chat with no blob at all gets one stamped for it", () => {
  openChat("chat-z", undefined);
  expect(getMetadataBlob().chatId).toBe("chat-z");
});

// --- the migration, over bytes this build never wrote ---

control("a REAL v3 blob migrates to v4 and stays readable", () => {
  // Not hand-written: this fixture is what the shipped v2-to-v3 migration emits when run over the
  // verbatim metadata of a real pre-v2.1 chat. A migration test over invented bytes only proves
  // the migration agrees with whoever invented them.
  const fixture = JSON.parse(readFileSync(join(__dirname, "../../test/fixtures/v3-chat-blob.json"), "utf-8"));
  expect(fixture.blob.version).toBe(3);
  const storyIds = Object.keys(fixture.blob.stories);
  expect(storyIds.length).toBeGreaterThan(0);

  openChat("chat-old", fixture.blob);
  const blob = getMetadataBlob();
  expect(blob.version).toBe(4);
  // Every story survives the bump: a migration that loses state is worse than no migration.
  expect(Object.keys(blob.stories).sort()).toEqual(storyIds.sort());
  expect(blob.selectedStoryId).toBe(fixture.blob.selectedStoryId);
});

control("a v3 blob is stamped null, never guessed from the chat that happens to be open", () => {
  // Guessing would manufacture the exact false provenance the stamp exists to prevent: the blob
  // would then claim to belong to whichever chat first opened it.
  const migrated = migrateV3ToV4({ selectedStoryId: "s1", stories: { s1: story("s1") } });
  expect(migrated.chatId).toBeNull();
  expect(migrated.version).toBe(4);
});
