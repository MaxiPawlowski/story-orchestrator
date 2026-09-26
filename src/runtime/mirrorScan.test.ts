import type { HostScannableEntry, Lorebook } from "@services/STAPI";
import { appendMirrorEntries, createMirrorScan, MirrorScanCache, mirrorBookFor, mirrorScanEntries, type MirrorOwnerSources } from "./mirrorScan";

const BOOK = "Story Orchestrator - Ruins - c1";
const book = (): Lorebook => ({
  entries: {
    0: { uid: 0, comment: "so_r1", content: "Arin trusts Luke.", key: ["Arin"], disable: false },
    1: { uid: 1, comment: "so_r2", content: "Luke owes the guild.", key: ["Luke"], disable: true },
    2: { uid: 2, comment: "so-owner", content: "{\"chatId\":\"c1\"}", key: [], disable: true },
    3: { uid: 3, comment: "author note", content: "not ours", key: ["x"], disable: false },
    4: { uid: 4, comment: "so_r3", content: "The gate is sealed.", key: ["gate"] },
  },
});
const arrays = (): HostScannableEntry[][] => [[{ world: "Global", uid: 9, comment: "g", content: "g" }], [], [], []];
const owner = (overrides: Partial<MirrorOwnerSources> = {}): MirrorOwnerSources => ({
  chatId: "c1",
  ownedChat: "c1",
  hasStory: true,
  book: { name: BOOK, chatId: "c1" },
  ...overrides,
});

describe("L1: the mirror book's enabled so_ entries, as scan copies", () => {
  it("keeps the enabled so_ entries only, with their real world and uid", () => {
    const entries = mirrorScanEntries(BOOK, book());
    expect(entries.map((entry) => [entry.world, entry.uid, entry.comment])).toEqual([[BOOK, 0, "so_r1"], [BOOK, 4, "so_r3"]]);
  });

  it("appends them to chat lore, one fresh copy per scan", () => {
    const entries = mirrorScanEntries(BOOK, book());
    const first = arrays();
    expect(appendMirrorEntries(first, BOOK, entries)).toBe(2);
    expect(first[2].map((entry) => entry.comment)).toEqual(["so_r1", "so_r3"]);
    first[2][0].disable = true;
    const second = arrays();
    appendMirrorEntries(second, BOOK, entries);
    expect(second[2][0].disable).toBe(false);
    expect(entries[0].disable).toBe(false);
  });

  it("U4 no double: nothing is appended when the book is already in any array (a slot bound the file-mode way)", () => {
    for (const index of [0, 1, 2, 3]) {
      const scan = arrays();
      scan[index].push({ world: BOOK.toUpperCase(), uid: 0, comment: "so_r1", content: "Arin trusts Luke." });
      expect(appendMirrorEntries(scan, BOOK, mirrorScanEntries(BOOK, book()))).toBe(0);
      expect(scan.flat().filter((entry) => entry.comment === "so_r1")).toHaveLength(1);
    }
  });
});

describe("L1: the owner guard (story and owned chat, NOT requirements)", () => {
  it("names the book for the owning chat", () => {
    expect(mirrorBookFor(owner())).toBe(BOOK);
  });

  it("U1: a branch of the owning chat, another chat, a no-story chat and an unclaimed chat get nothing", () => {
    expect(mirrorBookFor(owner({ chatId: "branch", ownedChat: "branch" }))).toBeNull();
    expect(mirrorBookFor(owner({ chatId: "c2" }))).toBeNull();
    expect(mirrorBookFor(owner({ hasStory: false }))).toBeNull();
    expect(mirrorBookFor(owner({ ownedChat: null }))).toBeNull();
    expect(mirrorBookFor(owner({ chatId: null, ownedChat: null }))).toBeNull();
    expect(mirrorBookFor(owner({ book: null }))).toBeNull();
  });

  it("negative control: appending without the guard leaks the parent's memory into its branch", () => {
    const branch = arrays();
    appendMirrorEntries(branch, BOOK, mirrorScanEntries(BOOK, book()));
    expect(branch[2].length).toBeGreaterThan(0);
  });
});

describe("L1: the in-memory copy the synchronous handler reads", () => {
  it("serves only the book it holds, and a slower earlier refresh never overwrites a later one", async () => {
    const waits: Array<(value: Lorebook | null) => void> = [];
    const cache = new MirrorScanCache((name) => new Promise<Lorebook | null>((resolve) => waits.push((value) => resolve(name === BOOK ? value ?? { entries: {} } : null))));
    const early = cache.refresh(BOOK);
    const late = cache.refresh(BOOK);
    waits[1](book());
    await late;
    waits[0]({ entries: {} });
    await early;
    expect(cache.entriesFor(BOOK)?.map((entry) => entry.comment)).toEqual(["so_r1", "so_r3"]);
    expect(cache.entriesFor("Story Orchestrator - Ruins - c2")).toBeNull();
    expect(cache.holds(BOOK)).toBe(true);
  });

  it("forgets the book when told to hold nothing", async () => {
    const cache = new MirrorScanCache(async () => book());
    await cache.refresh(BOOK);
    await cache.refresh(null);
    expect(cache.entriesFor(BOOK)).toBeNull();
  });
});

describe("L1: the scan-time mirror (host-free half of the handler)", () => {
  const setup = (sources: Partial<MirrorOwnerSources> = {}) => {
    const loads: string[] = [];
    let current = owner(sources);
    const scan = createMirrorScan({
      owner: () => current,
      load: async (name) => {
        loads.push(name);
        return name === BOOK ? book() : null;
      },
    });
    return { scan, loads, set: (patch: Partial<MirrorOwnerSources>) => { current = { ...current, ...patch }; } };
  };

  it("a scan before the copy is held appends nothing and asks for it once; the next scan appends", async () => {
    const { scan, loads } = setup();
    expect(scan.append(arrays())).toBe(0);
    expect(scan.append(arrays())).toBe(0);
    expect(loads).toEqual([BOOK]);
    await scan.settled();
    const next = arrays();
    expect(scan.append(next)).toBe(2);
    expect(next[2].map((entry) => entry.comment)).toEqual(["so_r1", "so_r3"]);
    scan.append(arrays());
    expect(loads).toEqual([BOOK]);
  });

  it("U1: a chat that does not own the book gets nothing and loads nothing", () => {
    const { scan, loads } = setup({ chatId: "branch", ownedChat: "branch" });
    expect(scan.append(arrays())).toBe(0);
    expect(loads).toEqual([]);
  });

  it("a save of the held book replaces the copy synchronously (an author's edit is what fires)", async () => {
    const { scan } = setup();
    scan.append(arrays());
    await scan.settled();
    scan.updated(BOOK, { entries: { 7: { uid: 7, comment: "so_new", content: "Edited.", key: ["gate"] } } });
    const next = arrays();
    expect(scan.append(next)).toBe(1);
    expect(next[2][0]).toMatchObject({ world: BOOK, uid: 7, comment: "so_new" });
  });

  it("the save that adopts this chat's book is held before the book is recorded, so the first scan after it appends", () => {
    const { scan, loads, set } = setup({ book: null });
    scan.updated(BOOK, book());
    scan.updated("Story Orchestrator - Ruins - c2", { entries: { 0: { uid: 0, comment: "so_x", content: "other chat" } } });
    set({ book: { name: BOOK, chatId: "c1" } });
    expect(scan.append(arrays())).toBe(2);
    expect(loads).toEqual([]);
  });

  it("a save of an unrelated book is ignored", async () => {
    const { scan } = setup();
    scan.append(arrays());
    await scan.settled();
    scan.updated("My Notes", { entries: {} });
    expect(scan.append(arrays())).toBe(2);
  });
});
