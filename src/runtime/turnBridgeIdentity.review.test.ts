import { hostMessageId, TurnBridge } from "./turnBridge";
import type { RuntimeManager } from "./runtimeManager";
import { BLOB_VERSION } from "./persistence";
import { testOwnership } from "../../test/findings/testOwnership";

const handlers = new Map<string, (...args: unknown[]) => unknown>();
const host = { generating: false, chat: [] as Array<{ mes: string; gen_finished?: unknown }>, chatId: "renamed", chatMetadata: {} as Record<string, unknown> };

jest.mock("./storyLibrary", () => ({ listStoryRecords: () => [] }));
jest.mock("@services/STAPI", () => ({
  settingsAreLoaded: () => true,
  settingsReady: async () => {},
  observeNextSave: async () => ({ requested: true, status: 200, ok: true, timedOut: false }),
  readServerBoundary: async () => null,
  getContext: () => ({ chat: host.chat, chatId: host.chatId, chatMetadata: host.chatMetadata, saveMetadata: () => undefined }),
  saveOpenChat: async () => { await (({ chat: host.chat, chatId: host.chatId, chatMetadata: host.chatMetadata, saveMetadata: () => undefined })).saveMetadata?.(); return { ok: true as const, chatId: "" }; },
  isHostGenerating: () => host.generating,
  subscribeToHostEvents: (entries: Array<{ eventName: string; handler: (...args: unknown[]) => unknown }>) => {
    for (const entry of entries) handlers.set(entry.eventName, entry.handler);
    return () => handlers.clear();
  },
}));

const settle = async () => {
  for (let i = 0; i < 6; i += 1) await Promise.resolve();
};

const emit = async (eventName: string, ...args: unknown[]) => {
  await handlers.get(eventName)?.(...args);
  await settle();
};

const rendered = async (messageId: unknown, type: string) => {
  await emit("MESSAGE_RECEIVED", messageId, type);
  await emit("CHARACTER_MESSAGE_RENDERED", messageId, type);
};

function harness() {
  const manager = {
    commitBoundary: jest.fn(async (_at?: number) => undefined),
    fireAfterSpeak: jest.fn(async () => undefined),
    rollbackFromMessage: jest.fn(async (_id: number) => undefined),
    rollbackOnEnter: jest.fn(async () => false),
    loadSelectedFromChat: jest.fn(async () => undefined),
    reapplyPromptBlocks: jest.fn(),
    reapplyCopilotNudge: jest.fn(),
    getOwnership: () => testOwnership(),
    notify: jest.fn(),
  };
  new TurnBridge(manager as unknown as RuntimeManager).start();
  return manager;
}

const finishedAt = (messageId: number, at: number) => {
  host.chat[messageId] = { mes: host.chat[messageId]?.mes ?? "", gen_finished: new Date(at) };
};

beforeEach(() => {
  jest.useFakeTimers();
  jest.setSystemTime(new Date("2026-09-23T00:00:00Z"));
  handlers.clear();
  host.generating = false;
  host.chat = [{ mes: "hello" }, { mes: "reply" }];
});
afterEach(() => jest.useRealTimers());

describe("V4: what one turn is", () => {
  it.each(["continue", "appendFinal"])("a '%s' on the message that already committed commits its own boundary, once per continuation", async (type) => {
    const manager = harness();
    finishedAt(1, 1000);
    await rendered(1, "normal");
    expect(manager.commitBoundary).toHaveBeenCalledTimes(1);

    host.chat[1].mes += " and more";
    finishedAt(1, 2000);
    await rendered(1, type);
    expect(manager.commitBoundary).toHaveBeenCalledTimes(2);

    finishedAt(1, 3000);
    await rendered(1, type);
    expect(manager.commitBoundary).toHaveBeenCalledTimes(3);
    expect(manager.commitBoundary.mock.calls.map(([at]) => at)).toEqual([1, 1, 1]);
  });

  it("control: a normal reply re-announced for the same message still commits once", async () => {
    const manager = harness();
    finishedAt(1, 1000);
    await rendered(1, "normal");
    finishedAt(1, 2000);
    await rendered(1, "normal");
    expect(manager.commitBoundary).toHaveBeenCalledTimes(1);
  });

  it("a group round commits one boundary per reply, each at its own message, in order", async () => {
    const manager = harness();
    host.chat.push({ mes: "a" }, { mes: "b" }, { mes: "c" });
    host.generating = true;
    await rendered(2, "normal");
    await rendered(3, "normal");
    await rendered(4, "normal");
    await emit("GENERATION_ENDED");
    expect(manager.commitBoundary).not.toHaveBeenCalled();

    host.generating = false;
    jest.advanceTimersByTime(400);
    await settle();
    expect(manager.commitBoundary.mock.calls.map(([at]) => at)).toEqual([2, 3, 4]);
  });

  it("a chat change during the round drops every pending reply", async () => {
    const manager = harness();
    host.generating = true;
    await rendered(1, "normal");
    await emit("CHAT_CHANGED");
    host.generating = false;
    jest.advanceTimersByTime(1000);
    await settle();
    expect(manager.commitBoundary).not.toHaveBeenCalled();
  });

  it("a null or empty id is not message 0", async () => {
    expect(hostMessageId(null)).toBeNull();
    expect(hostMessageId("")).toBeNull();
    expect(hostMessageId(undefined)).toBeNull();
    expect(hostMessageId("7")).toBe(7);
    expect(hostMessageId(0)).toBe(0);

    const manager = harness();
    await rendered(0, "normal");
    jest.advanceTimersByTime(300);
    await emit("MESSAGE_RECEIVED", null, "command");
    expect(manager.commitBoundary).toHaveBeenCalledTimes(2);
    expect(manager.commitBoundary.mock.calls[1][0]).toBeUndefined();

    await emit("MESSAGE_DELETED", null);
    await emit("MESSAGE_EDITED", undefined);
    expect(manager.rollbackFromMessage).not.toHaveBeenCalled();

    await emit("MESSAGE_DELETED", 1);
    expect(manager.rollbackFromMessage.mock.calls.map(([id]) => id)).toEqual([1]);
  });
});

describe("V5: a renamed chat keeps its story", () => {
  it("CHAT_RENAMED re-stamps the blob and reloads the story", async () => {
    const manager = harness();
    host.chatMetadata = { story_orchestrator: { version: BLOB_VERSION, chatId: "original", selectedStoryId: "s1", stories: {} } };
    await emit("CHAT_RENAMED", { oldFileName: "original.jsonl", newFileName: "renamed.jsonl" });
    expect((host.chatMetadata.story_orchestrator as { chatId: string }).chatId).toBe("renamed");
    expect(manager.loadSelectedFromChat).toHaveBeenCalledTimes(1);
  });

  it("control: a rename that is not this chat's reloads nothing", async () => {
    const manager = harness();
    host.chatMetadata = { story_orchestrator: { version: BLOB_VERSION, chatId: "original", selectedStoryId: "s1", stories: {} } };
    await emit("CHAT_RENAMED", { oldFileName: "other.jsonl", newFileName: "renamed.jsonl" });
    expect(manager.loadSelectedFromChat).not.toHaveBeenCalled();
  });
});
