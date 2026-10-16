const store = new Map<string, unknown>();
const server = new Map<string, unknown>();
const hostSave = jest.fn(async (_name: string, _data: unknown, _immediately?: boolean) => {});
const handlers: Array<(name: unknown, data?: unknown) => void> = [];

jest.mock("./modules", () => ({
  worldInfoModule: {
    worldInfoCache: {
      delete: (name: string) => store.delete(name),
      get: (name: string) => (store.has(name) ? structuredClone(store.get(name)) : undefined),
      set: (name: string, data: unknown) => { store.set(name, data); },
    },
    saveWorldInfo: (name: string, data: unknown, immediately?: boolean) => hostSave(name, data, immediately),
  },
}));
jest.mock("./events", () => ({
  subscribeToHostEvent: (_event: string, handler: (name: unknown, data?: unknown) => void) => { handlers.push(handler); return () => undefined; },
}));
jest.mock("./worldInfoServer", () => ({
  readServerLorebook: async (name: string) => (server.has(name) ? structuredClone(server.get(name)) : null),
}));

import { worldInfoModule } from "./modules";
import { flushPendingWorldSave, flushPendingWorldSaves, PENDING_WORLD_SAVE_MS, pendingWorldEdit, watchPendingWorldSaves } from "./worldInfoPending";

const cache = worldInfoModule.worldInfoCache as { get: (name: string) => unknown; set: (name: string, data: unknown) => void };
const original = (name: string) => ({ entries: { 0: { content: `original ${name}` } } });
const load = (name: string) => {
  server.set(name, original(name));
  cache.set(name, original(name));
};
const editorEdit = (name: string) => {
  if (!store.has(name)) load(name);
  const data = cache.get(name) as { entries: Record<number, { content: string }> };
  data.entries[0].content = `edited ${name}`;
  cache.set(name, data);
};

describe("an edit waiting in ST's one shared WI save debounce survives our immediate save (B14)", () => {
  let clock = 1_000;
  let stop: () => void = () => undefined;
  beforeEach(() => { clock = 1_000; store.clear(); server.clear(); hostSave.mockClear(); handlers.length = 0; stop = watchPendingWorldSaves(() => clock); });
  afterEach(() => stop());

  it("review 2026-10-16 #1: a load is not a pending edit; a save of an object the cache handed out is, with the server copy as its baseline", () => {
    load("Author Book");
    expect(pendingWorldEdit("Author Book", clock)).toBeNull();
    editorEdit("Author Book");
    expect(pendingWorldEdit("Author Book", clock)).toEqual({ at: clock, baseline: '{"0":{"content":"original Author Book"}}' });
    handlers.forEach((handler) => handler("Author Book", { entries: { 0: { content: "edited Author Book" } } }));
    expect(pendingWorldEdit("Author Book", clock)).toBeNull();
  });

  it("saves another book whose debounced save our write cancelled, from the host's cache", async () => {
    editorEdit("Author Book");
    clock += 300;
    expect(await flushPendingWorldSaves("Story Memory", clock)).toEqual({ ok: true, flushed: ["Author Book"] });
    expect(hostSave).toHaveBeenCalledWith("Author Book", { entries: { 0: { content: "edited Author Book" } } }, true);
  });

  it("review 2026-10-16 #1: never saves a waiting edit over a server copy that moved off its baseline", async () => {
    editorEdit("Author Book");
    server.set("Author Book", { entries: { 0: { content: "another page" } } });
    expect(await flushPendingWorldSaves("Story Memory", clock)).toEqual({ ok: true, flushed: [] });
    expect(hostSave).not.toHaveBeenCalled();
  });

  it("leaves alone the book just written, a book whose save already landed, a loaded book and a mark older than the debounce", async () => {
    editorEdit("Story Memory");
    editorEdit("Saved Book");
    handlers.forEach((handler) => handler("Saved Book"));
    load("Loaded Book");
    editorEdit("Old Book");
    clock += PENDING_WORLD_SAVE_MS + 1;
    expect(await flushPendingWorldSaves("Story Memory", clock)).toEqual({ ok: true, flushed: [] });
    expect(hostSave).not.toHaveBeenCalled();
  });

  it("flushes one named book's waiting edit and leaves the other marks for the shared flush (K12)", async () => {
    editorEdit("Author Book");
    editorEdit("Story Memory");
    expect(await flushPendingWorldSave("Story Memory", clock)).toEqual({ ok: true, flushed: true });
    expect(hostSave).toHaveBeenCalledTimes(1);
    expect(await flushPendingWorldSave("Story Memory", clock)).toEqual({ ok: true, flushed: false });
    expect(await flushPendingWorldSaves("Other", clock)).toEqual({ ok: true, flushed: ["Author Book"] });
  });

  it("a failed flush is reported, not swallowed", async () => {
    editorEdit("Author Book");
    hostSave.mockRejectedValueOnce(new Error("disk full"));
    expect(await flushPendingWorldSaves("Story Memory", clock)).toMatchObject({ ok: false, reason: expect.stringContaining("disk full") });
  });

  it("stopping restores the host's own cache writer", () => {
    stop();
    editorEdit("Author Book");
    return flushPendingWorldSaves("Story Memory", clock).then((result) => expect(result).toEqual({ ok: true, flushed: [] }));
  });
});
