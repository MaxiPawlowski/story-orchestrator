const host = {
  context: {} as Record<string, unknown>,
  answers: new Map<string, { ok: boolean; body: unknown } | "throw">(),
  requests: [] as Array<{ url: string; body: Record<string, unknown> }>,
};

globalThis.fetch = jest.fn(async (url: unknown, init?: { body?: string }) => {
  const path = String(url);
  host.requests.push({ url: path, body: JSON.parse(init?.body ?? "{}") as Record<string, unknown> });
  const answer = host.answers.get(path);
  if (!answer || answer === "throw") throw new Error("network down");
  return { ok: answer.ok, status: answer.ok ? 200 : 500, json: async () => answer.body } as unknown as Response;
}) as unknown as typeof fetch;

jest.mock("./context", () => ({ getContext: () => ({ getRequestHeaders: () => ({}), ...host.context }) }));

import { currentChatOwner, probeChatFile } from "./chatFiles";

const GROUP_INFO = "/api/chats/group/info";
const SOLO_LIST = "/api/characters/chats";

beforeEach(() => {
  host.context = { groups: [{ id: "grp-1", members: [], disabled_members: [], chats: ["chat-a"] }], characters: [{ name: "Ann", avatar: "Ann.png" }] };
  host.answers.clear();
  host.requests.length = 0;
});

describe("v2.4 T14: probeChatFile, group chats", () => {
  it("reads a chat the group still lists as present without asking the server (02-H11)", async () => {
    expect(await probeChatFile({ chatId: "chat-a", groupId: "grp-1", avatar: null })).toBe("present");
    expect(host.requests).toEqual([]);
  });

  it("reads the server's copy when the client list has dropped the id, because deleteGroupChat splices it first", async () => {
    host.answers.set(GROUP_INFO, { ok: true, body: { file_name: "chat-b.jsonl", match: true } });
    expect(await probeChatFile({ chatId: "chat-b", groupId: "grp-1", avatar: null })).toBe("present");
    expect(host.requests).toEqual([{ url: GROUP_INFO, body: { id: "chat-b" } }]);
  });

  it("reads a missing file as absent", async () => {
    host.answers.set(GROUP_INFO, { ok: true, body: { match: false } });
    expect(await probeChatFile({ chatId: "chat-b", groupId: "grp-1", avatar: null })).toBe("absent");
  });

  it("cannot tell on a failed or unexpected answer", async () => {
    host.answers.set(GROUP_INFO, { ok: false, body: null });
    expect(await probeChatFile({ chatId: "chat-b", groupId: "grp-1", avatar: null })).toBe("unknown");
    host.answers.set(GROUP_INFO, "throw");
    expect(await probeChatFile({ chatId: "chat-b", groupId: "grp-1", avatar: null })).toBe("unknown");
    host.answers.set(GROUP_INFO, { ok: true, body: {} });
    expect(await probeChatFile({ chatId: "chat-b", groupId: "grp-1", avatar: null })).toBe("unknown");
  });
});

describe("v2.4 T14: probeChatFile, solo chats", () => {
  it("lists the character's chat files and finds the id among them", async () => {
    host.answers.set(SOLO_LIST, { ok: true, body: [{ file_name: "Ann - 1.jsonl", file_id: "Ann - 1" }] });
    expect(await probeChatFile({ chatId: "Ann - 1", groupId: null, avatar: "Ann.png" })).toBe("present");
    expect(host.requests).toEqual([{ url: SOLO_LIST, body: { avatar_url: "Ann.png", simple: true } }]);
  });

  it("reads an id missing from the list, or an empty directory, as absent", async () => {
    host.answers.set(SOLO_LIST, { ok: true, body: [{ file_name: "Ann - 2.jsonl", file_id: "Ann - 2" }] });
    expect(await probeChatFile({ chatId: "Ann - 1", groupId: null, avatar: "Ann.png" })).toBe("absent");
    host.answers.set(SOLO_LIST, { ok: true, body: [] });
    expect(await probeChatFile({ chatId: "Ann - 1", groupId: null, avatar: "Ann.png" })).toBe("absent");
  });

  it("cannot tell from {error: true}, which is also how a missing directory answers", async () => {
    host.answers.set(SOLO_LIST, { ok: true, body: { error: true } });
    expect(await probeChatFile({ chatId: "Ann - 1", groupId: null, avatar: "Ann.png" })).toBe("unknown");
  });

  it("cannot tell without a group or an avatar", async () => {
    expect(await probeChatFile({ chatId: "Ann - 1", groupId: null, avatar: null })).toBe("unknown");
    expect(host.requests).toEqual([]);
  });
});

describe("v2.4 T14: currentChatOwner", () => {
  it("names a group chat by its group", () => {
    host.context = { ...host.context, chatId: "chat-a", groupId: "grp-1", chatMetadata: { integrity: "i-1" } };
    expect(currentChatOwner()).toEqual({ chatId: "chat-a", integrity: "i-1", groupId: "grp-1", avatar: null });
  });

  it("names a solo chat by its character's avatar", () => {
    host.context = { ...host.context, chatId: "Ann - 1", groupId: null, characterId: "0", chatMetadata: {} };
    expect(currentChatOwner()).toEqual({ chatId: "Ann - 1", integrity: null, groupId: null, avatar: "Ann.png" });
  });

  it("has no owner without an open chat", () => {
    host.context = { ...host.context, chatId: undefined, groupId: null };
    expect(currentChatOwner()).toBeNull();
  });
});
