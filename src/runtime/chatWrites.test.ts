// v2.4 E3: every chat write of ours outside persist goes through `saveOpenChat`, which arms the save
// watcher for the open chat. Each one now hands that observation to whoever records save evidence, named
// by what it wrote, so a selection or a dropped state that never reached the server is not silent.

const metadata: Record<string, unknown> = {};
const context = { chatId: "chat-a", chatMetadata: metadata };
const observed = Promise.resolve({ requested: true, status: 200, ok: true, timedOut: false, failed: false });
const saveOpenChat = jest.fn(async () => ({ ok: true as const, chatId: context.chatId, observed }));

jest.mock("@services/STAPI", () => ({
  settingsAreLoaded: () => true,
  settingsReady: async () => {},
  getContext: () => context,
  saveOpenChat: () => saveOpenChat(),
}));

import { dropPersistedRuntime, onChatWrite, replaceUnreadableBlob, restampRenamedChat, setSelectedStoryId, type ChatWrite } from "./persistence";

const settle = async () => { for (let index = 0; index < 5; index += 1) await Promise.resolve(); };

let heard: ChatWrite[] = [];
let stop: () => void = () => {};

beforeEach(() => {
  for (const key of Object.keys(metadata)) delete metadata[key];
  context.chatId = "chat-a";
  heard = [];
  saveOpenChat.mockClear();
  stop = onChatWrite((write) => { heard.push(write); });
});

afterEach(() => stop());

describe("v2.4 E3: chat writes hand their observation on", () => {
  it("a selection, a dropped state, a replaced blob and a rename restamp each name what they wrote", async () => {
    setSelectedStoryId("s1");
    dropPersistedRuntime("s1");
    metadata.story_orchestrator = { version: 99 };
    replaceUnreadableBlob();
    metadata.story_orchestrator = { version: 4, chatId: "old-name", selectedStoryId: null, stories: {} };
    context.chatId = "new-name";
    restampRenamedChat("old-name.jsonl", "new-name.jsonl");
    await settle();
    expect(heard.map((write) => [write.kind, write.chatId])).toEqual([["select", "chat-a"], ["drop", "chat-a"], ["replace", "chat-a"], ["restamp", "new-name"]]);
    expect(heard.every((write) => write.observed === observed)).toBe(true);
  });

  it("control: a write refused before it reached the chat hands nothing on", async () => {
    metadata.story_orchestrator = { version: 4, chatId: "chat-z", selectedStoryId: "s1", stories: {} };
    setSelectedStoryId("s2");
    dropPersistedRuntime("s1");
    await settle();
    expect(saveOpenChat).not.toHaveBeenCalled();
    expect(heard).toEqual([]);
  });

  it("control: a save that could not start (no chat open) hands nothing on", async () => {
    saveOpenChat.mockResolvedValueOnce({ ok: false, reason: "no chat is open" } as never);
    setSelectedStoryId("s1");
    await settle();
    expect(heard).toEqual([]);
  });

  it("stops handing writes on once the listener is disposed", async () => {
    stop();
    setSelectedStoryId("s1");
    await settle();
    expect(heard).toEqual([]);
  });
});
