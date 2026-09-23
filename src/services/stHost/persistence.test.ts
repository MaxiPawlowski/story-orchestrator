jest.mock("./context", () => ({
  getContext: () => ({ chatId: "chat-1", groupId: "g1", getRequestHeaders: () => ({ "Content-Type": "application/json" }) }),
}));

type Deferred = { resolve: (response: { ok: boolean; status: number; json: () => Promise<unknown> }) => void };
const pending: Deferred[] = [];
const calls: Array<{ url: string; body: unknown }> = [];

globalThis.fetch = ((url: string, init?: { body?: string }) => {
  calls.push({ url, body: init?.body ? JSON.parse(init.body) : null });
  if (url.includes("/group/get")) {
    return Promise.resolve({ ok: true, status: 200, json: async () => [{ chat_metadata: { story_orchestrator: { selectedStoryId: "s1", stories: { s1: { engineState: { boundary: 7 } } } } } }, { mes: "hi" }] });
  }
  return new Promise((resolve) => { pending.push({ resolve }); });
}) as unknown as typeof fetch;

import { installSaveWatcher, observeNextSave, readServerBoundary } from "./persistence";

const answer = (status: number) => pending.shift()!.resolve({ ok: status < 300, status, json: async () => ({}) });

describe("V16: save evidence is attributed and read back from the server", () => {
  beforeAll(() => installSaveWatcher());

  it("a save request that started BEFORE the observation was armed does not settle it", async () => {
    const early = fetch("/api/chats/group/save", { method: "POST", body: "{}" });
    let settled: unknown = null;
    const watched = observeNextSave(2000).then((observation) => { settled = observation; return observation; });
    answer(500);
    await early;
    await Promise.resolve();
    expect(settled).toBeNull();
    const late = fetch("/api/chats/group/save", { method: "POST", body: "{}" });
    answer(200);
    await late;
    expect(await watched).toMatchObject({ requested: true, status: 200, ok: true });
  });

  it("reads the boundary from the server's stored chat file, not from the page's memory", async () => {
    expect(await readServerBoundary()).toBe(7);
    expect(calls.at(-1)).toMatchObject({ url: "/api/chats/group/get", body: { id: "chat-1" } });
  });
});
