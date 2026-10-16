type Entry = { uid: number; comment: string; content: string; key: string[]; disable: boolean };
type Book = { entries: Record<number, Entry> };

const clone = <T>(value: T): T => structuredClone(value);

class HostCache extends Map<string, Book> {
  get(name: string): Book | undefined {
    const value = super.get(name);
    return value === undefined ? undefined : clone(value);
  }
}

const listeners = new Map<string, Array<(...args: unknown[]) => unknown>>();
const emit = async (event: string, ...args: unknown[]) => { for (const handler of listeners.get(event) ?? []) await handler(...args); };

const st = {
  disk: new Map<string, Book>(),
  cache: new HostCache(),
  worldNames: [] as string[],
  posts: [] as Array<{ url: string; name: string; data?: Book }>,
  debounced: null as null | { name: string; data: Book },
  holdGet: null as null | ((name: string, count: number) => Promise<void>),
  gets: 0,
  plugin: false,
  beforeWrite: null as null | (() => void),
};

globalThis.fetch = jest.fn(async (url: unknown, init?: { body?: string }) => {
  const body = JSON.parse(init?.body ?? "{}") as { name: string; data?: Book };
  if (url === "/api/worldinfo/get") {
    st.gets += 1;
    if (st.holdGet) await st.holdGet(body.name, st.gets);
    const book = st.disk.get(body.name);
    return { ok: true, status: 200, json: async () => clone(book ?? { entries: {} }) } as unknown as Response;
  }
  if (url === "/api/worldinfo/edit") {
    st.beforeWrite?.();
    st.posts.push({ url, name: body.name, data: clone(body.data) });
    st.disk.set(body.name, clone(body.data!));
    return { ok: true, status: 200, json: async () => ({ ok: true }) } as unknown as Response;
  }
  if (url === "/api/plugins/story-orchestrator-lore/commit" && st.plugin) {
    st.beforeWrite?.();
    const { expected } = JSON.parse(init?.body ?? "{}") as { expected: string };
    const current = st.disk.get(body.name);
    if (!current || lorebookRevision(entriesImage(current)) !== expected) return { ok: false, status: 409, json: async () => ({ conflict: true }) } as unknown as Response;
    st.posts.push({ url, name: body.name, data: clone(body.data) });
    st.disk.set(body.name, clone(body.data!));
    return { ok: true, status: 200, json: async () => ({ ok: true }) } as unknown as Response;
  }
  return { ok: false, status: 404, json: async () => null } as unknown as Response;
}) as unknown as typeof fetch;

async function hostSave(name: string, data: Book) {
  st.debounced = null;
  await fetch("/api/worldinfo/edit", { method: "POST", body: JSON.stringify({ name, data }) });
  await emit("WORLDINFO_UPDATED", name, data);
}

const loadWorldInfo = async (name: string) => {
  if (st.cache.has(name)) return st.cache.get(name);
  const response = await fetch("/api/worldinfo/get", { method: "POST", body: JSON.stringify({ name }) });
  const data = await response.json() as Book;
  st.cache.set(name, data);
  return data;
};

const saveWorldInfo = async (name: string, data: Book, immediately = false) => {
  st.cache.set(name, data);
  if (immediately) return hostSave(name, data);
  st.debounced = { name, data };
};

const runDebounce = async () => {
  const pending = st.debounced;
  if (pending) await hostSave(pending.name, pending.data);
};

jest.mock("./context", () => ({
  getContext: () => ({
    getRequestHeaders: () => ({}),
    loadWorldInfo: (name: string) => loadWorldInfo(name),
    saveWorldInfo: (name: string, data: Book, immediately?: boolean) => saveWorldInfo(name, data, immediately),
    getWorldInfoNames: () => st.worldNames,
    eventTypes: { WORLDINFO_UPDATED: "WORLDINFO_UPDATED" },
    eventSource: { emit: (event: string, ...args: unknown[]) => emit(event, ...args) },
  }),
}));

jest.mock("./modules", () => ({
  worldInfoModule: {
    get worldInfoCache() { return st.cache; },
    saveWorldInfo: (name: string, data: Book, immediately?: boolean) => saveWorldInfo(name, data, immediately),
    createWorldInfoEntry: (_name: string, data: Book) => {
      const uid = Math.max(-1, ...Object.keys(data.entries).map(Number)) + 1;
      data.entries[uid] = { uid, comment: "", content: "", key: [], disable: false };
      return data.entries[uid];
    },
  },
}));

jest.mock("./events", () => ({
  subscribeToHostEvent: (event: string, handler: (...args: unknown[]) => unknown) => {
    listeners.set(event, [...(listeners.get(event) ?? []), handler]);
    return () => listeners.set(event, (listeners.get(event) ?? []).filter((entry) => entry !== handler));
  },
}));

import { createWIEntry, deleteWIEntryAt, disableWIEntry, restoreWIEntryAt, setWIEntriesState, updateWIEntryByUid, upsertWIEntry } from "./worldInfo";
import { watchPendingWorldSaves } from "./worldInfoPending";
import { entriesImage, lorebookRevision } from "./lorebookImage";

const BOOK = "Shared Lore";
const entry = (uid: number, comment: string, content: string, disable = false): Entry => ({ uid, comment, content, key: [], disable });
const seed = () => {
  st.disk.set(BOOK, { entries: { 3: entry(3, "Gate", "The gate."), 5: entry(5, "Ferry", "The ferry.") } });
  st.worldNames = [BOOK];
};
const otherPageEdits = () => {
  const book = clone(st.disk.get(BOOK)!);
  book.entries[5].content = "OTHER PAGE EDIT";
  st.disk.set(BOOK, book);
};
const ourPosts = () => st.posts.filter((post) => post.name === BOOK);

let stop: () => void = () => undefined;

beforeEach(() => {
  st.disk.clear();
  st.cache.clear();
  st.posts = [];
  st.debounced = null;
  st.holdGet = null;
  st.gets = 0;
  st.plugin = false;
  st.beforeWrite = null;
  listeners.clear();
  stop = watchPendingWorldSaves();
});

afterEach(() => stop());

describe("review 2026-10-16 #1: conflict detection never saves over the conflicting server book", () => {
  it("a recent load is not a pending edit: another page's change refuses the write, is never saved over, and nothing is posted", async () => {
    seed();
    await loadWorldInfo(BOOK);
    otherPageEdits();
    const result = await setWIEntriesState(BOOK, { disable: "Gate" });
    expect(result).toEqual({ ok: false, reason: expect.stringContaining("another page changed") });
    expect(ourPosts()).toEqual([]);
    expect(st.disk.get(BOOK)!.entries[5].content).toBe("OTHER PAGE EDIT");
    expect(st.disk.get(BOOK)!.entries[3].disable).toBe(false);
  });

  it("this page's pending edit beside a remote edit is refused, not flushed over the remote edit", async () => {
    seed();
    const editor = await loadWorldInfo(BOOK) as Book;
    editor.entries[3].content = "LOCAL EDIT";
    await saveWorldInfo(BOOK, editor);
    otherPageEdits();
    const result = await setWIEntriesState(BOOK, { disable: "Ferry" });
    expect(result).toEqual({ ok: false, reason: expect.stringContaining("another page changed") });
    expect(ourPosts()).toEqual([]);
    expect(st.disk.get(BOOK)!.entries[5]).toMatchObject({ content: "OTHER PAGE EDIT", disable: false });
  });

  it("this page's pending edit over an unchanged server copy is saved first, then the write lands with both (B14 kept)", async () => {
    seed();
    const editor = await loadWorldInfo(BOOK) as Book;
    editor.entries[5].content = "LOCAL EDIT";
    await saveWorldInfo(BOOK, editor);
    const result = await setWIEntriesState(BOOK, { disable: "Gate" });
    expect(result).toEqual({ ok: true, changed: true, confirmed: true });
    expect(st.disk.get(BOOK)!.entries[5].content).toBe("LOCAL EDIT");
    expect(st.disk.get(BOOK)!.entries[3].disable).toBe(true);
    await runDebounce();
    expect(st.disk.get(BOOK)!.entries[3].disable).toBe(true);
  });
});

describe("review 2026-10-16 #4: each write is built on a detached candidate, never on ST's cached book", () => {
  it("while the preflight read is suspended, ST's own load still sees the book without the uncommitted flag; on refusal neither server nor cache holds it", async () => {
    seed();
    let seenDuringPreflight: Book | undefined;
    st.holdGet = async (_name, count) => {
      if (count !== 2) return;
      seenDuringPreflight = await loadWorldInfo(BOOK);
      otherPageEdits();
    };
    const result = await setWIEntriesState(BOOK, { disable: "Gate" });
    expect(seenDuringPreflight?.entries[3].disable).toBe(false);
    expect(result).toEqual({ ok: false, reason: expect.stringContaining("another page changed") });
    expect(ourPosts()).toEqual([]);
    expect(st.disk.get(BOOK)!.entries[3].disable).toBe(false);
    expect(st.disk.get(BOOK)!.entries[5].content).toBe("OTHER PAGE EDIT");
    expect(st.cache.has(BOOK) ? st.cache.get(BOOK)!.entries[3].disable : false).toBe(false);
  });

  it("a write that lands updates the cache to exactly what the server holds", async () => {
    seed();
    expect(await setWIEntriesState(BOOK, { disable: "Gate" })).toEqual({ ok: true, changed: true, confirmed: true });
    expect(st.cache.get(BOOK)).toEqual(st.disk.get(BOOK));
  });
});

describe("review 2026-10-16 #2: a write whose run lapses during a suspended read writes nothing", () => {
  const owner = () => {
    let owned = true;
    return { guard: { stillOwns: () => owned }, lapse: () => { owned = false; } };
  };
  const writers: Array<[string, (guard: { stillOwns(): boolean }) => Promise<unknown>]> = [
    ["setWIEntriesState", (guard) => setWIEntriesState(BOOK, { disable: "Gate" }, guard)],
    ["disableWIEntry", (guard) => disableWIEntry(BOOK, "Gate", guard)],
    ["upsertWIEntry", (guard) => upsertWIEntry(BOOK, "Gate", "The gate fell.", [], { guard })],
    ["updateWIEntryByUid", (guard) => updateWIEntryByUid({ lorebookFileId: BOOK, uid: 3 }, { content: "The gate fell." }, guard)],
    ["restoreWIEntryAt", (guard) => restoreWIEntryAt({ lorebookFileId: BOOK, uid: 3 }, { content: "The gate fell.", disabled: true }, guard)],
    ["createWIEntry", (guard) => createWIEntry(BOOK, { comment: "Marn", keys: ["Marn"], content: "Sells maps." }, guard)],
    ["deleteWIEntryAt", (guard) => deleteWIEntryAt({ lorebookFileId: BOOK, uid: 3 }, guard)],
  ];
  const untouched = () => {
    expect(ourPosts()).toEqual([]);
    expect(st.disk.get(BOOK)).toEqual({ entries: { 3: entry(3, "Gate", "The gate."), 5: entry(5, "Ferry", "The ferry.") } });
  };

  it.each(writers)("%s: lapse while the book's first load is suspended", async (_name, write) => {
    seed();
    const run = owner();
    st.holdGet = async (_book, count) => { if (count === 1) run.lapse(); };
    const result = await write(run.guard);
    expect(result === "failed" || (result as { ok?: boolean }).ok === false).toBe(true);
    untouched();
  });

  it.each(writers)("%s: lapse while the preflight comparison read is suspended", async (_name, write) => {
    seed();
    const run = owner();
    st.holdGet = async (_book, count) => { if (count === 2) run.lapse(); };
    const result = await write(run.guard);
    expect(result === "failed" || (result as { ok?: boolean }).ok === false).toBe(true);
    untouched();
  });

  it("this page's waiting edit is not flushed by a write whose run lapsed during the preflight read", async () => {
    seed();
    const editor = await loadWorldInfo(BOOK) as Book;
    editor.entries[5].content = "LOCAL EDIT";
    await saveWorldInfo(BOOK, editor);
    const run = owner();
    st.holdGet = async (_book, count) => { if (count === 2) run.lapse(); };
    expect(await setWIEntriesState(BOOK, { disable: "Gate" }, run.guard)).toMatchObject({ ok: false });
    untouched();
  });

  it("control: an owned run writes", async () => {
    seed();
    expect(await setWIEntriesState(BOOK, { disable: "Gate" }, owner().guard)).toEqual({ ok: true, changed: true, confirmed: true });
    expect(st.disk.get(BOOK)!.entries[3].disable).toBe(true);
  });
});

describe("review 2026-10-16 #3: the save itself is conditional on the server still holding the write's base", () => {
  const bWrites = () => {
    const book = clone(st.disk.get(BOOK)!);
    book.entries[5].content = "B WROTE BETWEEN A's READ AND A's SAVE";
    st.disk.set(BOOK, book);
  };

  it("B's write lands between A's preflight read and A's save: A is refused by the plugin and B survives", async () => {
    seed();
    st.plugin = true;
    st.beforeWrite = () => { st.beforeWrite = null; bWrites(); };
    const result = await setWIEntriesState(BOOK, { disable: "Gate" });
    expect(result).toEqual({ ok: false, reason: expect.stringContaining("another page changed") });
    expect(result).toEqual({ ok: false, reason: expect.stringContaining('"Ferry"') });
    expect(ourPosts()).toEqual([]);
    expect(st.disk.get(BOOK)!.entries[5].content).toBe("B WROTE BETWEEN A's READ AND A's SAVE");
    expect(st.disk.get(BOOK)!.entries[3].disable).toBe(false);
    expect(st.cache.has(BOOK)).toBe(false);
  });

  it("two of our writers built on the same copy: the second is refused, the first's change is kept", async () => {
    seed();
    st.plugin = true;
    let second: Promise<unknown> | null = null;
    st.holdGet = async (_name, count) => {
      if (count !== 2) return;
      second = updateWIEntryByUid({ lorebookFileId: BOOK, uid: 5 }, { content: "SECOND WRITER" });
    };
    const first = await setWIEntriesState(BOOK, { disable: "Gate" });
    const late = await second;
    const outcomes = [first, late].map((result) => (result as { ok: boolean }).ok).sort();
    expect(outcomes).toEqual([false, true]);
    const disk = st.disk.get(BOOK)!;
    expect([disk.entries[3].disable, disk.entries[5].content === "SECOND WRITER"].filter(Boolean)).toHaveLength(1);
  });

  it("a committed write updates ST's cache and announces WORLDINFO_UPDATED like ST's own save", async () => {
    seed();
    st.plugin = true;
    const announced: unknown[] = [];
    listeners.set("WORLDINFO_UPDATED", [...(listeners.get("WORLDINFO_UPDATED") ?? []), (name: unknown) => announced.push(name)]);
    expect(await setWIEntriesState(BOOK, { disable: "Gate" })).toEqual({ ok: true, changed: true, confirmed: true });
    expect(ourPosts().map((post) => post.url)).toEqual(["/api/plugins/story-orchestrator-lore/commit"]);
    expect(st.cache.get(BOOK)).toEqual(st.disk.get(BOOK));
    expect(announced).toEqual([BOOK]);
  });

  it("without the plugin the write falls back to ST's save after the preflight comparison", async () => {
    seed();
    expect(await setWIEntriesState(BOOK, { disable: "Gate" })).toEqual({ ok: true, changed: true, confirmed: true });
    expect(ourPosts().map((post) => post.url)).toEqual(["/api/worldinfo/edit"]);
  });

  it("the page and the plugin compute the same revision (vector pinned in server-plugin/story-orchestrator-lore/plugin.test.mjs)", () => {
    expect(lorebookRevision(entriesImage({ entries: { 3: { uid: 3, comment: "Gate", content: "The gate." } } }))).toBe("36-61763caa6860bd84");
  });
});
