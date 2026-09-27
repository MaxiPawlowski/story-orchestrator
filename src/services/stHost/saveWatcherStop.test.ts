jest.mock("./context", () => ({
  getContext: () => ({ chatId: "chat-1", groupId: null, saveMetadata: async () => undefined, eventSource: { on: () => undefined, off: () => undefined }, eventTypes: {}, getRequestHeaders: () => ({}) }),
}));

const base = (() => new Promise(() => undefined)) as unknown as typeof fetch;
globalThis.fetch = base;

import { installSaveWatcher, observeNextSave, saveWatcherRefusalRing, startSaveWatcherSurface } from "./persistence";

const published = () => Reflect.get(globalThis, "storyOrchestratorSaveRefusals");

describe("the save watcher's surface is disposed with the runtime (v2.5 batch 2, E4)", () => {
  afterEach(() => { globalThis.fetch = base; });

  it("publishes the dev refusal ring only while started, and a stop removes it", () => {
    expect(published()).toBeUndefined();
    const stop = startSaveWatcherSurface();
    expect(published()).toBe(saveWatcherRefusalRing());
    stop();
    expect(Reflect.has(globalThis, "storyOrchestratorSaveRefusals")).toBe(false);
  });

  it("a stop puts back the fetch it wrapped and settles a watch still waiting", async () => {
    const stop = startSaveWatcherSurface();
    installSaveWatcher();
    expect(globalThis.fetch).not.toBe(base);
    const waiting = observeNextSave(60_000);
    stop();
    expect(globalThis.fetch).toBe(base);
    await expect(waiting).resolves.toMatchObject({ ok: false, requested: false });
  });

  it("leaves a peer that wrapped on top of it in place", () => {
    const stop = startSaveWatcherSurface();
    installSaveWatcher();
    const ours = globalThis.fetch;
    const peer = ((input: RequestInfo | URL, init?: RequestInit) => ours(input, init)) as typeof fetch;
    globalThis.fetch = peer;
    stop();
    expect(globalThis.fetch).toBe(peer);
  });
});
