import { hashMemoryText } from "@memory/stores";
import type { MemoryEntry } from "@memory/types";
import type { ChatLorebookBinding, Lorebook } from "@services/STAPI";
import { mirrorLorebookName, syncMemoryMirror, type MemoryMirrorHost, type MemoryMirrorInput } from "./memoryMirror";

type FakeEntry = { uid: number; comment: string; content: string; key: string[]; disable: boolean };

const fakeHost = (options: { chatId?: string | null; books?: Record<string, FakeEntry[]>; slot?: string } = {}) => {
  const books = new Map<string, FakeEntry[]>(Object.entries(options.books ?? {}));
  const state = { chatId: options.chatId === undefined ? "chat-a" : options.chatId, slot: options.slot ?? "" };
  const calls = { created: [] as string[], upserts: [] as string[], disabled: [] as string[][], binds: [] as Array<{ name: string; replaceable: string[] }> };
  const host: MemoryMirrorHost = {
    getChatId: () => state.chatId,
    ensureLorebook: jest.fn(async (name: string) => {
      if (books.has(name)) return { name, created: false };
      books.set(name, []);
      calls.created.push(name);
      return { name, created: true };
    }),
    loadLorebook: async (name: string) => (books.has(name) ? { entries: Object.fromEntries(books.get(name)!.map((entry) => [entry.uid, entry])) } as unknown as Lorebook : null),
    upsertWIEntry: jest.fn(async (lorebook: string, comment: string, content: string, keys: string[] = []) => {
      const book = books.get(lorebook);
      if (!book) return "failed" as const;
      calls.upserts.push(comment);
      const found = book.find((entry) => entry.comment === comment);
      if (found) {
        Object.assign(found, { content, key: keys, disable: false });
        return "updated" as const;
      }
      book.push({ uid: book.length, comment, content, key: keys, disable: false });
      return "created" as const;
    }),
    disableWIEntry: jest.fn(async (lorebook: string, comments: string | string[]) => {
      const list = Array.isArray(comments) ? comments : [comments];
      calls.disabled.push(list);
      for (const entry of books.get(lorebook) ?? []) if (list.includes(entry.comment)) entry.disable = true;
      return { ok: true as const, changed: true };
    }),
    bindChatLorebook: (name: string, replaceable: string[] = []): ChatLorebookBinding => {
      calls.binds.push({ name, replaceable });
      if (state.slot === name) return "already-bound";
      if (state.slot && books.has(state.slot) && !replaceable.includes(state.slot)) return "occupied";
      state.slot = name;
      return "bound";
    },
  };
  return { host, books, state, calls };
};

let seq = 0;
const memory = (patch: Partial<MemoryEntry> = {}): MemoryEntry => ({
  id: `m${++seq}`,
  tier: "session_details",
  text: `Arin owes Max a favour (${seq}).`,
  type: "relationship",
  importance: 2,
  expiration: "permanent",
  entities: ["Arin", "Max"],
  confidence: 1,
  activationTriggers: [],
  evidence: "",
  createdAt: 1,
  recallCount: 0,
  ...patch,
});

const input = (entries: MemoryEntry[], patch: Partial<MemoryMirrorInput> = {}): MemoryMirrorInput => ({ title: "Crossing", entries, writes: {}, book: null, ...patch });
const bookA = mirrorLorebookName("Crossing", "chat-a");
const enabledComments = (entries: FakeEntry[] = []) => entries.filter((entry) => !entry.disable).map((entry) => entry.comment);

describe("syncMemoryMirror", () => {
  it("creates this chat's own book on the first write and binds it to the chat", async () => {
    const { host, books, state, calls } = fakeHost();
    const relationship = memory();
    const result = await syncMemoryMirror(input([relationship, memory({ tier: "facts", type: "fact" })]), host);
    expect(calls.created).toEqual([bookA]);
    expect(enabledComments(books.get(bookA))).toEqual([`so_${relationship.id}`]);
    expect(books.get(bookA)![0].key).toEqual(["Arin", "Max"]);
    expect(state.slot).toBe(bookA);
    expect(result).toMatchObject({ changed: true, book: { name: bookA, chatId: "chat-a" }, writes: { [`so_${relationship.id}`]: hashMemoryText(relationship.text) } });
    expect(result!.summary).toMatchObject({ created: 1, lorebook: bookA, binding: "bound" });
  });

  it("creates nothing while there is nothing to mirror", async () => {
    const { host, calls } = fakeHost();
    const result = await syncMemoryMirror(input([memory({ type: "fact", tier: "facts" })]), host);
    expect(host.ensureLorebook).not.toHaveBeenCalled();
    expect(calls.binds).toEqual([]);
    expect(result!.changed).toBe(false);
  });

  it("writes only what changed once the chat owns its book, and never re-binds a slot the user may have cleared", async () => {
    const kept = memory();
    const edited = memory();
    const { host, books, calls } = fakeHost({ books: { [bookA]: [] } });
    const first = await syncMemoryMirror(input([kept, edited]), host);
    calls.upserts.length = 0;
    calls.binds.length = 0;
    const second = await syncMemoryMirror(input([kept, { ...edited, text: "Arin paid the favour back." }], { writes: first!.writes, book: first!.book }), host);
    expect(calls.upserts).toEqual([`so_${edited.id}`]);
    expect(calls.binds).toEqual([]);
    expect(second!.summary).toMatchObject({ unchanged: 1, updated: 1, binding: null });
    expect(books.get(bookA)!.find((entry) => entry.comment === `so_${edited.id}`)!.content).toBe("Arin paid the favour back.");
  });

  it("disables what stopped being live and forgets it", async () => {
    const stays = memory();
    const goes = memory();
    const { host, books } = fakeHost({ books: { [bookA]: [] } });
    const first = await syncMemoryMirror(input([stays, goes]), host);
    const second = await syncMemoryMirror(input([stays, { ...goes, supersededBy: stays.id }], { writes: first!.writes, book: first!.book }), host);
    expect(enabledComments(books.get(bookA))).toEqual([`so_${stays.id}`]);
    expect(Object.keys(second!.writes)).toEqual([`so_${stays.id}`]);
    expect(second!.summary.disabled).toBe(1);
  });

  // V17: a refused disable used to be forgotten anyway, leaving a superseded fact live in the book
  // and untracked. It is kept, so the next sync tries again.
  it("keeps a stale entry it could not switch off, so the next sync retries it", async () => {
    const stays = memory();
    const goes = memory();
    const { host } = fakeHost({ books: { [bookA]: [] } });
    const first = await syncMemoryMirror(input([stays, goes]), host);
    host.disableWIEntry = jest.fn(async () => ({ ok: false as const, reason: "refused" }));
    const second = await syncMemoryMirror(input([stays, { ...goes, supersededBy: stays.id }], { writes: first!.writes, book: first!.book }), host);
    expect(Object.keys(second!.writes).sort()).toEqual([`so_${goes.id}`, `so_${stays.id}`].sort());
    expect(second!.summary.disabled).toBe(0);
  });

  it("switches off an earlier playthrough's entries when a restarted chat adopts its book again", async () => {
    const previous: FakeEntry[] = [
      { uid: 0, comment: "so_old-1", content: "Arin hates Max.", key: ["Arin"], disable: false },
      { uid: 1, comment: "Authored note", content: "Not ours.", key: [], disable: false },
    ];
    const { host, books } = fakeHost({ books: { [bookA]: previous } });
    const fresh = memory();
    const result = await syncMemoryMirror(input([fresh]), host);
    expect(enabledComments(books.get(bookA))).toEqual(["Authored note", `so_${fresh.id}`]);
    expect(result!.summary).toMatchObject({ disabled: 1, created: 1 });
  });

  it("gives a branched chat its own book and replaces the parent's binding", async () => {
    const shared = memory();
    const parent = { name: bookA, chatId: "chat-a" };
    const { host, books, state, calls } = fakeHost({ chatId: "chat-b", books: { [bookA]: [] }, slot: bookA });
    const result = await syncMemoryMirror(input([shared], { writes: { [`so_${shared.id}`]: hashMemoryText(shared.text) }, book: parent }), host);
    const bookB = mirrorLorebookName("Crossing", "chat-b");
    expect(enabledComments(books.get(bookB))).toEqual([`so_${shared.id}`]);
    expect(calls.binds).toEqual([{ name: bookB, replaceable: [bookA] }]);
    expect(state.slot).toBe(bookB);
    expect(result!.book).toEqual({ name: bookB, chatId: "chat-b" });
  });

  it("keeps the user's own chat lorebook and still writes the mirror", async () => {
    const { host, books, state } = fakeHost({ books: { "My Chat Notes": [] }, slot: "My Chat Notes" });
    const result = await syncMemoryMirror(input([memory()]), host);
    expect(state.slot).toBe("My Chat Notes");
    expect(result!.summary.binding).toBe("occupied");
    expect(books.get(bookA)).toHaveLength(1);
  });

  it("rewrites everything into a book the user deleted", async () => {
    const entry = memory();
    const { host, books, calls } = fakeHost();
    const result = await syncMemoryMirror(input([entry], { writes: { [`so_${entry.id}`]: hashMemoryText(entry.text) }, book: { name: bookA, chatId: "chat-a" } }), host);
    expect(calls.created).toEqual([bookA]);
    expect(enabledComments(books.get(bookA))).toEqual([`so_${entry.id}`]);
    expect(result!.summary.created).toBe(1);
  });

  it("abandons the sync when the chat changes underneath it, leaving the next chat's slot alone", async () => {
    const { host, state, calls } = fakeHost();
    (host.upsertWIEntry as jest.Mock).mockImplementationOnce(async () => {
      state.chatId = "chat-z";
      return "created";
    });
    expect(await syncMemoryMirror(input([memory()]), host)).toBeNull();
    expect(calls.binds).toEqual([]);
    expect(state.slot).toBe("");
  });

  it("writes nothing when the book cannot be created", async () => {
    const { host, calls } = fakeHost();
    (host.ensureLorebook as jest.Mock).mockResolvedValueOnce(null);
    const result = await syncMemoryMirror(input([memory()]), host);
    expect(host.upsertWIEntry).not.toHaveBeenCalled();
    expect(calls.binds).toEqual([]);
    expect(result!.changed).toBe(false);
  });

  it("does nothing without an open chat", async () => {
    const { host } = fakeHost({ chatId: null });
    expect((await syncMemoryMirror(input([memory()]), host))!.changed).toBe(false);
    expect(host.ensureLorebook).not.toHaveBeenCalled();
  });
});
