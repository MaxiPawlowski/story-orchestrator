const host = { saving: false, sent: 0, chatId: "chat-1" };

jest.mock("./context", () => ({
  getContext: () => ({
    chatId: host.chatId,
    groupId: "g1",
    getRequestHeaders: () => ({ "Content-Type": "application/json" }),
    saveMetadata: async () => {
      if (host.saving) return;
      host.sent += 1;
      await fetch("/api/chats/group/save", { method: "POST", body: "{}" });
    },
  }),
}));

type Deferred = { resolve: (response: { ok: boolean; status: number; json: () => Promise<unknown> }) => void };
const pending: Deferred[] = [];

globalThis.fetch = ((_url: string) => new Promise((resolve) => { pending.push({ resolve }); })) as unknown as typeof fetch;

import { installSaveWatcher, observeNextSave, saveOpenChat } from "./persistence";

const answer = (status: number) => pending.shift()!.resolve({ ok: status < 300, status, json: async () => ({}) });
const until = async (condition: () => boolean, ms = 3000) => {
  const deadline = Date.now() + ms;
  while (!condition() && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 20));
};

beforeAll(() => installSaveWatcher());
beforeEach(() => {
  host.saving = false;
  host.sent = 0;
  host.chatId = "chat-1";
});

describe("T0: a save ST holds back behind a save still running", () => {
  it("is sent again once the running save finishes, so the observation settles on a real request", async () => {
    host.saving = true;
    const running = fetch("/api/chats/group/save", { method: "POST", body: "{}" });
    const asked = saveOpenChat("persist");
    await until(() => pending.length === 1);
    host.saving = false;
    answer(200);
    await running;
    await until(() => pending.length === 1);
    expect(host.sent).toBe(1);
    answer(200);
    const result = await asked;
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(await result.observed).toMatchObject({ requested: true, ok: true, status: 200 });
  });

  it("is not sent again into another chat opened meanwhile", async () => {
    host.saving = true;
    const running = fetch("/api/chats/group/save", { method: "POST", body: "{}" });
    const asked = saveOpenChat("persist");
    await until(() => pending.length === 1);
    host.chatId = "chat-2";
    host.saving = false;
    answer(200);
    await running;
    await until(() => host.sent > 0, 500);
    expect(host.sent).toBe(0);
    const result = await asked;
    const late = fetch("/api/chats/group/save", { method: "POST", body: "{}" });
    answer(200);
    await late;
    if (result.ok) expect(await result.observed).toMatchObject({ ok: true });
  });

  it("a save that never went out while nothing was running is still a plain timeout", async () => {
    host.saving = true;
    const observed = observeNextSave(200);
    expect(await observed).toMatchObject({ requested: false, timedOut: true });
    expect((await observeNextSave(50)).busy).toBeFalsy();
  });

  it("a save still waiting when the window closes reports busy, not 'nothing went out'", async () => {
    host.saving = true;
    const running = fetch("/api/chats/group/save", { method: "POST", body: "{}" });
    const observed = observeNextSave(200);
    expect(await observed).toMatchObject({ requested: false, timedOut: true, busy: true });
    answer(200);
    await running;
  });
});
