const handlers = new Map<string, Set<() => void>>();
const eventSource = {
  on: (name: string, handler: () => void) => { if (!handlers.has(name)) handlers.set(name, new Set()); handlers.get(name)!.add(handler); },
  off: (name: string, handler: () => void) => { handlers.get(name)?.delete(handler); },
};
const emit = (name: string) => [...(handlers.get(name) ?? [])].forEach((handler) => handler());

let mockOpenChat = "chat-1";

jest.mock("./context", () => ({
  getContext: () => ({ chatId: mockOpenChat, groupId: "g1", saveMetadata: async () => undefined, eventSource, eventTypes: { SETTINGS_UPDATED: "settings_updated" }, getRequestHeaders: () => ({ "Content-Type": "application/json" }) }),
}));

type Answer = { ok: boolean; status: number; json: () => Promise<unknown> };
const pending: Array<{ url: string; resolve: (answer: Answer) => void; reject: (error: Error) => void }> = [];
let serverSettings: unknown = JSON.stringify({ extension_settings: { "story-orchestrator": { v2Stories: [{ id: "s1", version: 2 }] } } });

const base = ((url: string) => {
  if (url.includes("/api/settings/get")) return Promise.resolve({ ok: true, status: 200, json: async () => ({ settings: serverSettings }) });
  return new Promise((resolve, reject) => { pending.push({ url, resolve, reject }); });
}) as unknown as typeof fetch;
globalThis.fetch = base;

import { installSaveWatcher, observeNextSave, observeNextSettingsSave, readServerExtensionSettings, saveOpenChat, saveWatcherRefusalRing, saveWatcherRefusals, saveWatcherStats, startSaveWatcherSurface } from "./persistence";

const answer = (status: number) => pending.shift()!.resolve({ ok: status < 300, status, json: async () => ({}) });
const settle = async () => { for (let i = 0; i < 5; i += 1) await Promise.resolve(); };

describe("v2.4 plan 02 §7 (T8): the save watcher heals and reports each request once", () => {
  beforeAll(() => installSaveWatcher());

  it("re-wraps when a peer put its own captured fetch back, so the next save is still observed", async () => {
    globalThis.fetch = base;
    const wrapsBefore = saveWatcherStats().wraps;
    const watched = observeNextSave(2000);
    expect(globalThis.fetch).not.toBe(base);
    expect(saveWatcherStats().wraps).toBe(wrapsBefore + 1);
    const save = fetch("/api/chats/group/save", { method: "POST", body: "{}" });
    answer(200);
    await save;
    expect(await watched).toMatchObject({ requested: true, status: 200, ok: true });
  });

  it("control: a watcher that is still in place is not wrapped again", async () => {
    const wrapsBefore = saveWatcherStats().wraps;
    const watched = observeNextSave(2000);
    expect(saveWatcherStats().wraps).toBe(wrapsBefore);
    const save = fetch("/api/chats/save", { method: "POST", body: "{}" });
    answer(200);
    await save;
    expect(await watched).toMatchObject({ ok: true });
  });

  it("reports a request once when a peer wrapped on top of us and we wrapped on top of the peer", async () => {
    const underPeer = globalThis.fetch;
    globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => underPeer(input, init)) as typeof fetch;
    const watched = observeNextSave(2000);
    const reportsBefore = saveWatcherStats().reports;
    const save = fetch("/api/chats/group/save", { method: "POST", body: "{}" });
    const later = observeNextSave(300);
    answer(200);
    await save;
    await settle();
    expect(await watched).toMatchObject({ ok: true });
    expect(saveWatcherStats().reports - reportsBefore).toBe(1);
    expect(await later).toMatchObject({ requested: false, timedOut: true });
  });

  it("observes /api/settings/save apart from the chat saves, and reads a failed answer as one", async () => {
    const chat = observeNextSave(300);
    const settings = observeNextSettingsSave(2000);
    const save = fetch("/api/settings/save", { method: "POST", body: "{}" });
    answer(500);
    await save;
    expect(await settings).toMatchObject({ requested: true, status: 500, ok: false, timedOut: false });
    expect(await chat).toMatchObject({ requested: false, timedOut: true });
  });

  it("settles on SETTINGS_UPDATED only when no settings request went past the watcher", async () => {
    const bypassed = observeNextSettingsSave(2000);
    emit("settings_updated");
    expect(await bypassed).toMatchObject({ ok: true, status: null });

    const seen = observeNextSettingsSave(300);
    const save = fetch("/api/settings/save", { method: "POST", body: "{}" });
    emit("settings_updated");
    await settle();
    answer(503);
    await save;
    expect(await seen).toMatchObject({ ok: false, status: 503 });
  });

  it("gives every observation one request settled the same burst", async () => {
    const first = observeNextSettingsSave(2000);
    const second = observeNextSettingsSave(2000);
    const save = fetch("/api/settings/save", { method: "POST", body: "{}" });
    answer(200);
    await save;
    const [a, b] = await Promise.all([first, second]);
    expect(a.burst).toBeDefined();
    expect(a.burst).toBe(b.burst);
  });

  it("reads the server's copy of one extension's settings out of the JSON string it answers", async () => {
    expect(await readServerExtensionSettings("story-orchestrator")).toEqual({ v2Stories: [{ id: "s1", version: 2 }] });
    expect(await readServerExtensionSettings("someone-else")).toEqual({});
    serverSettings = { not: "a string" };
    expect(await readServerExtensionSettings("story-orchestrator")).toBeNull();
  });
});

describe("v2.4 plan 02 (J10.14): a save that runs after the open chat changed", () => {
  beforeAll(() => installSaveWatcher());
  const groupSave = (id: string, messages: number, integrity: string | null = "i-1") => fetch("/api/chats/group/save", { method: "POST", body: JSON.stringify({ id, chat: [{ chat_metadata: integrity ? { integrity } : {} }, ...Array.from({ length: messages }, (_, index) => ({ mes: `m${index}` }))] }) });

  it("holds back an empty save of another chat while our save is armed, and says why it did not count", async () => {
    const watched = observeNextSave(2000, "chat-1");
    const before = pending.length;
    const response = await groupSave("chat-1 - Branch #1", 0);
    expect(response.ok).toBe(true);
    expect(pending.length).toBe(before);
    expect(await watched).toMatchObject({ ok: false, requested: false, lost: expect.stringContaining('"chat-1 - Branch #1"') });
  });

  it("control: an empty save of the chat our save was asked for is sent", async () => {
    const watched = observeNextSave(2000, "chat-1");
    const save = groupSave("chat-1", 0);
    await settle();
    answer(200);
    await save;
    expect(await watched).toMatchObject({ ok: true, requested: true, status: 200 });
  });

  it("control: a save of another chat that carries messages is sent, and does not count as ours", async () => {
    const watched = observeNextSave(2000, "chat-1");
    const save = groupSave("chat-2", 2);
    await settle();
    answer(200);
    expect((await save).ok).toBe(true);
    expect(await watched).toMatchObject({ ok: false, status: 200, lost: expect.stringContaining('wrote "chat-2", not "chat-1"') });
  });

  it("holds back an empty save that carries no integrity, whoever made it (the switch clears the metadata)", async () => {
    const before = pending.length;
    const refused = saveWatcherStats().refused;
    expect((await groupSave("chat-7", 0, null)).ok).toBe(true);
    expect(pending.length).toBe(before);
    expect(saveWatcherStats().refused).toBe(refused + 1);
  });

  it("control: a save without integrity that carries messages is sent (a chat from before integrity existed)", async () => {
    const watched = observeNextSave(2000);
    const save = groupSave("chat-7", 2, null);
    await settle();
    answer(200);
    await save;
    expect(await watched).toMatchObject({ ok: true });
  });

  it("control: with no chat named, an empty save of any chat is sent", async () => {
    const watched = observeNextSave(2000);
    const save = groupSave("chat-2", 0);
    await settle();
    answer(200);
    await save;
    expect(await watched).toMatchObject({ ok: true });
  });
});

describe("v2.4 plan 02: every chat save of ours arms the guard", () => {
  it("saveOpenChat names the open chat, so an empty save that lands in another chat is held back", async () => {
    const opened = await saveOpenChat();
    expect(opened).toMatchObject({ ok: true, chatId: "chat-1" });
    const before = pending.length;
    const refused = saveWatcherStats().refused;
    await fetch("/api/chats/group/save", { method: "POST", body: JSON.stringify({ id: "chat-9", chat: [{ chat_metadata: { integrity: "i-9" } }] }) });
    expect(pending.length).toBe(before);
    expect(saveWatcherStats().refused).toBe(refused + 1);
    const save = fetch("/api/chats/group/save", { method: "POST", body: JSON.stringify({ id: "chat-1", chat: [{ chat_metadata: { integrity: "i-1" } }] }) });
    await settle();
    answer(200);
    await save;
    expect(opened.ok && await opened.observed).toMatchObject({ ok: false, lost: expect.stringContaining("chat-9") });
  });

  it("(E3) hands back the observation it armed, settled by the open chat's save", async () => {
    const opened = await saveOpenChat();
    const save = fetch("/api/chats/group/save", { method: "POST", body: JSON.stringify({ id: "chat-1", chat: [{ chat_metadata: { integrity: "i-1" } }, { mes: "hi" }] }) });
    await settle();
    answer(500);
    await save;
    expect(opened.ok && await opened.observed).toMatchObject({ requested: true, status: 500, ok: false });
  });

  it("(dedupe) one request serving a selection and a persist settles both with its burst, naming the selection as the save that asked", async () => {
    const opened = await saveOpenChat("select");
    const persisted = observeNextSave(2000, "chat-1");
    const save = fetch("/api/chats/group/save", { method: "POST", body: JSON.stringify({ id: "chat-1", chat: [{ chat_metadata: { integrity: "i-1" } }, { mes: "hi" }] }) });
    await settle();
    answer(500);
    await save;
    const selection = opened.ok ? await opened.observed : null;
    expect(selection).toMatchObject({ status: 500, askedBy: "select" });
    expect(await persisted).toMatchObject({ status: 500, askedBy: "select", burst: selection?.burst });
  });

  it("control: a request a persist asked for names no write, and a later request its own", async () => {
    const persisted = observeNextSave(2000, "chat-1");
    const opened = await saveOpenChat("drop");
    const first = fetch("/api/chats/group/save", { method: "POST", body: JSON.stringify({ id: "chat-1", chat: [{ chat_metadata: { integrity: "i-1" } }, { mes: "hi" }] }) });
    await settle();
    answer(200);
    await first;
    expect(await persisted).toMatchObject({ askedBy: null });
    expect(opened.ok && await opened.observed).toMatchObject({ askedBy: null });
    const reopened = await saveOpenChat("drop");
    const second = fetch("/api/chats/group/save", { method: "POST", body: JSON.stringify({ id: "chat-1", chat: [{ chat_metadata: { integrity: "i-1" } }, { mes: "hi" }] }) });
    await settle();
    answer(200);
    await second;
    expect(reopened.ok && await reopened.observed).toMatchObject({ askedBy: "drop" });
  });
});

describe("v2.5 plan 02 C2: a save of ours that ST ran after the open chat changed", () => {
  beforeAll(() => installSaveWatcher());
  afterEach(() => { mockOpenChat = "chat-1"; });
  const chatBody = (key: "id" | "file_name", id: string, messages: number) => JSON.stringify({ [key]: id, chat: [{ chat_metadata: { integrity: `i-${id}` } }, ...Array.from({ length: messages }, (_, index) => ({ mes: `m${index}` }))] });
  const soloSave = (id: string, messages: number) => fetch("/api/chats/save", { method: "POST", body: chatBody("file_name", id, messages) });
  const groupSave = (id: string, messages: number) => fetch("/api/chats/group/save", { method: "POST", body: chatBody("id", id, messages) });
  const sentBy = async (post: () => Promise<Response>) => {
    const before = pending.length;
    const response = post();
    await settle();
    const sent = pending.length - before;
    while (pending.length > before) answer(200);
    expect((await response).ok).toBe(true);
    return sent;
  };

  it("holds back the late save even when the chat it lands in has messages, and records it as lost", async () => {
    const watched = observeNextSave(2000, "chat-1");
    mockOpenChat = "solo-1";
    const refused = saveWatcherStats().refused;
    expect(await sentBy(() => soloSave("solo-1", 3))).toBe(0);
    expect(saveWatcherStats().refused).toBe(refused + 1);
    expect(await watched).toMatchObject({ ok: false, requested: false, lost: expect.stringMatching(/"solo-1".*"chat-1"/) });
    expect(saveWatcherRefusals().at(-1)).toMatchObject({ file: "solo-1", rows: 3, integrity: "i-solo-1", askedFor: "chat-1", open: "solo-1" });
  });

  it("saveOpenChat arms the same guard", async () => {
    const opened = await saveOpenChat();
    mockOpenChat = "solo-2";
    expect(await sentBy(() => soloSave("solo-2", 2))).toBe(0);
    expect(opened.ok && await opened.observed).toMatchObject({ ok: false, lost: expect.stringContaining("solo-2") });
  });

  it("control: a save of ours that posts to the chat it was asked for is sent, messages and all", async () => {
    const watched = observeNextSave(2000, "chat-1");
    const refused = saveWatcherStats().refused;
    const save = groupSave("chat-1", 3);
    await settle();
    answer(200);
    await save;
    expect(saveWatcherStats().refused).toBe(refused);
    expect(await watched).toMatchObject({ ok: true, requested: true, status: 200 });
  });

  it("control: ST's own save of the chat it now has open is sent when no save of ours is armed", async () => {
    mockOpenChat = "solo-3";
    const refused = saveWatcherStats().refused;
    const save = soloSave("solo-3", 4);
    await settle();
    answer(200);
    expect((await save).status).toBe(200);
    expect(saveWatcherStats().refused).toBe(refused);
  });

  it("exposes the refusals on a page global a recorder can drain, in order", () => {
    startSaveWatcherSurface();
    const ring = (globalThis as { storyOrchestratorSaveRefusals?: unknown[] }).storyOrchestratorSaveRefusals;
    expect(ring).toBe(saveWatcherRefusalRing());
    expect(saveWatcherRefusals().length).toBeGreaterThan(0);
    expect(saveWatcherRefusals().every((entry, index, all) => index === 0 || entry.seq > all[index - 1].seq)).toBe(true);
  });
});
