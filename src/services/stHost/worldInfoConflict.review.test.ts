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
  holdGet: null as null | ((name: string) => Promise<void>),
};

globalThis.fetch = jest.fn(async (url: unknown, init?: { body?: string }) => {
  const body = JSON.parse(init?.body ?? "{}") as { name: string; data?: Book };
  if (url === "/api/worldinfo/get") {
    if (st.holdGet) await st.holdGet(body.name);
    const book = st.disk.get(body.name);
    return { ok: true, status: 200, json: async () => clone(book ?? { entries: {} }) } as unknown as Response;
  }
  if (url === "/api/worldinfo/edit") {
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

import { setWIEntriesState } from "./worldInfo";
import { watchPendingWorldSaves } from "./worldInfoPending";

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
