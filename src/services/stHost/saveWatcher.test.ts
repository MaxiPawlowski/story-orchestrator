const handlers = new Map<string, Set<() => void>>();
const eventSource = {
  on: (name: string, handler: () => void) => { if (!handlers.has(name)) handlers.set(name, new Set()); handlers.get(name)!.add(handler); },
  off: (name: string, handler: () => void) => { handlers.get(name)?.delete(handler); },
};
const emit = (name: string) => [...(handlers.get(name) ?? [])].forEach((handler) => handler());

jest.mock("./context", () => ({
  getContext: () => ({ chatId: "chat-1", groupId: "g1", eventSource, eventTypes: { SETTINGS_UPDATED: "settings_updated" }, getRequestHeaders: () => ({ "Content-Type": "application/json" }) }),
}));

type Answer = { ok: boolean; status: number; json: () => Promise<unknown> };
const pending: Array<{ url: string; resolve: (answer: Answer) => void; reject: (error: Error) => void }> = [];
let serverSettings: unknown = JSON.stringify({ extension_settings: { "story-orchestrator": { v2Stories: [{ id: "s1", version: 2 }] } } });

const base = ((url: string) => {
  if (url.includes("/api/settings/get")) return Promise.resolve({ ok: true, status: 200, json: async () => ({ settings: serverSettings }) });
  return new Promise((resolve, reject) => { pending.push({ url, resolve, reject }); });
}) as unknown as typeof fetch;
globalThis.fetch = base;

import { installSaveWatcher, observeNextSave, observeNextSettingsSave, readServerExtensionSettings, saveWatcherStats } from "./persistence";

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
