// v2.3 plan 03 (S3): the persisted blob now says which chat it belongs to.
//
// `persist()` already declines to WRITE a run into the wrong chat. This is the other half: a read.
// `chat_metadata` belongs to SillyTavern, which swaps it when the chat changes, so a read racing
// that swap was indistinguishable from an ordinary one. That is the v2.1 plan 08 defect seen from
// the reading end — one chat's run turning up in another chat.
//
// Two rules:
//   1. A blob stamped for this chat is read normally.
//   2. A blob stamped for ANOTHER chat is replaced, not repaired. Adopting its stories would be
//      the same mistake in the opposite direction.
// v2.5 plan 11: every stored blob is stamped. One that is not is unreadable, and with no chat open
// nothing is stored at all.

import { control, must } from "../../test/findings/ledger";
import { currentRecord } from "../../test/findings/currentRecord";

jest.mock("@services/STAPI", () => ({
  settingsAreLoaded: () => true,
  settingsReady: async () => {},
  observeNextSave: async () => ({ requested: true, status: 200, ok: true, timedOut: false }),
  readServerBoundary: async () => null, getContext: () => globalThis.__blobContext }));
jest.mock("./storyLibrary", () => ({ listStoryRecords: () => [] }));

import { BLOB_VERSION, blobMismatch, getMetadataBlob, loadPersistedRuntime, savePersistedRuntime, setSelectedStoryId } from "./persistence";

declare global {
  // eslint-disable-next-line no-var
  var __blobContext: { chatId: string | undefined; chatMetadata: Record<string, unknown>; saveMetadata?: () => void };
}

const story = (id: string) => currentRecord(id) as never;

function openChat(chatId: string | undefined, blob: unknown) {
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

control("an unstamped blob is unreadable, left untouched, and never takes this chat's id", () => {
  openChat("chat-a", { version: BLOB_VERSION, chatId: null, selectedStoryId: "s1", stories: { s1: story("s1") } });
  const before = JSON.stringify(globalThis.__blobContext.chatMetadata);
  expect(getMetadataBlob().selectedStoryId).toBeNull();
  expect(blobMismatch()).toMatchObject({ kind: "unreadable", foundVersion: BLOB_VERSION });
  expect(savePersistedRuntime(story("s2"))).toEqual([]);
  expect(JSON.stringify(globalThis.__blobContext.chatMetadata)).toBe(before);
});

control("a chat with no blob at all gets one stamped for it", () => {
  openChat("chat-z", undefined);
  expect(getMetadataBlob().chatId).toBe("chat-z");
});

control("with no chat open, a read stores nothing and a write is refused", () => {
  openChat(undefined, undefined);
  expect(getMetadataBlob().selectedStoryId).toBeNull();
  setSelectedStoryId("s1");
  expect(savePersistedRuntime(story("s1"))).toEqual([]);
  expect(globalThis.__blobContext.chatMetadata).toEqual({});
});
