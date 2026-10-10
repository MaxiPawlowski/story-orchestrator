type Entry = { uid: number; comment: string; content: string; key: string[]; disable: boolean };
type Book = { entries: Record<number, Entry> };

// A small ST: the server's worlds folder (keyed by sanitized file id, answering an unknown name with
// the dummy `{entries:{}}`), the client's `world_names` list that only a refresh brings up to date,
// and `worldInfoCache`, which keeps whatever `loadWorldInfo` fetched — the dummy included.
const st = {
  disk: new Map<string, Book>(),
  worldNames: [] as string[],
  cache: new Map<string, Book>(),
  selected: [] as string[],
  stuck: false,
  mirror: [] as string[],
  chatMetadata: {} as Record<string, unknown>,
  chatId: "chat-1" as string | null,
  saves: 0,
};
const fileId = (name: string) => name.replace(/[/?<>\\:*|"]/g, "");
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

const loadWorldInfo = jest.fn(async (name: string) => {
  if (!st.cache.has(name)) st.cache.set(name, clone(st.disk.get(fileId(name)) ?? { entries: {} }));
  return clone(st.cache.get(name));
});
const saveWorldInfo = jest.fn(async (name: string, data: Book) => {
  st.cache.set(name, data);
  if (server.lose) { server.lose = false; return; }
  st.disk.set(fileId(name), clone(data));
});
const updateWorldInfoList = jest.fn(async () => {
  st.worldNames = [...st.disk.keys()];
});
const createNewWorldInfo = jest.fn(async (name: string) => {
  if (st.worldNames.some((known) => known.toLowerCase() === fileId(name).toLowerCase())) return false;
  await saveWorldInfo(name, { entries: {} });
  await updateWorldInfoList();
  return true;
});
// world-info.js:4346-4393: false for an unlisted name or a refused request; on success the book leaves
// the disk, the cache and `world_names`.
const hostDelete = { refuse: false, keepListed: false };
const deleteWorldInfo = jest.fn(async (name: string) => {
  if (!st.worldNames.includes(name) || hostDelete.refuse) return false;
  st.disk.delete(fileId(name));
  st.cache.delete(name);
  if (!hostDelete.keepListed) await updateWorldInfoList();
  return true;
});
const executeSlashCommands = jest.fn(async (command: string) => {
  const off = command.startsWith("/world silent=true state=off ");
  const name = command.replace(/^\/world silent=true state=(on|off) /, "").replace(/^"|"$/g, "");
  if (off && st.selected.includes(name) && !st.stuck) st.selected.splice(st.selected.indexOf(name), 1);
  if (!off && st.worldNames.includes(name)) st.selected.push(name);
  return true;
});

// The server's own copy, read back after a save: `lose` drops the next save on the floor (ST's `_save`
// never reads the answer, so a refused save resolves like a kept one), `blind` makes the read fail.
const server = { lose: false, blind: false };
globalThis.fetch = jest.fn(async (_url: unknown, init?: { body?: string }) => {
  if (server.blind) return { ok: false, status: 500, json: async () => null } as unknown as Response;
  const { name } = JSON.parse(init?.body ?? "{}") as { name: string };
  return { ok: true, status: 200, json: async () => clone(st.disk.get(fileId(name)) ?? { entries: {} }) } as unknown as Response;
}) as unknown as typeof fetch;

jest.mock("./context", () => ({
  getContext: () => ({
    getRequestHeaders: () => ({}),
    loadWorldInfo: (name: string) => loadWorldInfo(name),
    saveWorldInfo: (name: string, data: Book) => saveWorldInfo(name, data),
    getWorldInfoNames: () => st.worldNames,
    chatMetadata: st.chatMetadata,
    chatId: st.chatId,
    saveMetadata: async () => { st.saves += 1; },
  }),
}));

jest.mock("./modules", () => ({
  worldInfoModule: {
    METADATA_KEY: "world_info",
    get selected_world_info() { return st.selected; },
    getWorldInfoSettings: () => ({ world_info: { globalSelect: st.mirror } }),
    updateWorldInfoList: () => updateWorldInfoList(),
    createNewWorldInfo: (name: string) => createNewWorldInfo(name),
    deleteWorldInfo: (name: string) => deleteWorldInfo(name),
    saveWorldInfo: (name: string, data: Book) => saveWorldInfo(name, data),
    createWorldInfoEntry: (_name: string, data: Book) => {
      const uid = Object.keys(data.entries).length;
      data.entries[uid] = { uid, comment: "", content: "", key: [], disable: false };
      return data.entries[uid];
    },
    worldInfoCache: { delete: (name: string) => st.cache.delete(name) },
  },
}));

jest.mock("./slashCommands", () => ({
  executeSlashCommands: (command: string) => executeSlashCommands(command),
}));

import { bindChatLorebook, createLorebook, createWIEntry, deactivateGlobalLorebook, deleteLorebook, deleteWIEntryAt, disableWIEntry, enableWIEntry, ensureLorebook, listSelectedLorebooks, loadLorebook, lorebookExists, setWIEntriesState, unbindChatLorebook, updateWIEntryByUid, upsertWIEntry } from "./worldInfo";

const putOnDisk = (name: string, entries: Entry[] = []) => st.disk.set(name, { entries: Object.fromEntries(entries.map((entry) => [entry.uid, entry])) });
const entry = (uid: number, comment: string, content = "text"): Entry => ({ uid, comment, content, key: [], disable: false });

beforeEach(() => {
  st.disk.clear();
  st.cache.clear();
  st.worldNames = [];
  st.selected.length = 0;
  st.mirror = [];
  st.stuck = false;
  for (const key of Object.keys(st.chatMetadata)) delete st.chatMetadata[key];
  st.chatId = "chat-1";
  jest.spyOn(console, "warn").mockImplementation(() => undefined);
});

// v2.4 plan 02 §8: requirements re-read on WORLDINFO_SETTINGS_UPDATED must see the selection that event
// announces. `world_info.globalSelect` is assigned inside a debounced save (world-info.js:83-85), so
// right after a toggle it still names the previous selection.
describe("lorebook selection", () => {
  it("reads the live selected_world_info, not the debounced globalSelect mirror", () => {
    st.selected.push("Fresh Lore");
    st.mirror = ["Stale Lore"];
    expect(listSelectedLorebooks()).toEqual(["Fresh Lore"]);
  });
});

describe("lorebook existence", () => {
  it("never asks the host for a book that is not listed, so its dummy never lands in the cache", async () => {
    expect(await loadLorebook("Missing")).toBeNull();
    expect(loadWorldInfo).not.toHaveBeenCalled();
    expect(st.cache.size).toBe(0);
  });

  it("refuses to upsert into a missing book instead of writing a raw file the picker never lists", async () => {
    expect(await upsertWIEntry("Missing", "so_1", "Arin trusts Max.")).toBe("failed");
    expect(st.disk.has("Missing")).toBe(false);
    expect(saveWorldInfo).not.toHaveBeenCalled();
  });

  it("matches the listed file id, not the name the book was saved under", async () => {
    putOnDisk("Sun Ruins Lore");
    st.worldNames = ["Sun Ruins Lore"];
    expect(lorebookExists("sun ruins: lore")).toBe(true);
    expect(lorebookExists("Sun Ruins")).toBe(false);
  });
});

describe("ensureLorebook", () => {
  it("creates a missing book through createNewWorldInfo, listed immediately with no reload", async () => {
    expect(await ensureLorebook("Story Orchestrator - Crossing - chat-1")).toEqual({ name: "Story Orchestrator - Crossing - chat-1", created: true });
    expect(createNewWorldInfo).toHaveBeenCalledTimes(1);
    expect(lorebookExists("Story Orchestrator - Crossing - chat-1")).toBe(true);
    expect(await upsertWIEntry("Story Orchestrator - Crossing - chat-1", "so_1", "Arin trusts Max.")).toBe("created");
    expect(Object.values(st.disk.get("Story Orchestrator - Crossing - chat-1")!.entries).map((written) => written.content)).toEqual(["Arin trusts Max."]);
  });

  it("returns an existing book without creating or refreshing", async () => {
    putOnDisk("Lore");
    st.worldNames = ["Lore"];
    expect(await ensureLorebook("lore")).toEqual({ name: "Lore", created: false });
    expect(createNewWorldInfo).not.toHaveBeenCalled();
    expect(updateWorldInfoList).not.toHaveBeenCalled();
  });

  // createNewWorldInfo checks only the client list, then writes `{entries:{}}` over the file.
  it("adopts a book the client list has not caught up with instead of emptying it, and drops its stale cached dummy", async () => {
    st.cache.set("Other Tab", { entries: {} });
    putOnDisk("Other Tab", [entry(0, "The bridge", "Rebuilt.")]);
    expect(await ensureLorebook("Other Tab")).toEqual({ name: "Other Tab", created: false });
    expect(createNewWorldInfo).not.toHaveBeenCalled();
    expect(st.disk.get("Other Tab")!.entries[0].content).toBe("Rebuilt.");
    expect((await loadLorebook("Other Tab"))!.entries[0].content).toBe("Rebuilt.");
  });

  it("creates a title the server would sanitize under its file id, once", async () => {
    expect(await ensureLorebook("Story Orchestrator - Sun: Ruins?")).toEqual({ name: "Story Orchestrator - Sun Ruins", created: true });
    expect(await ensureLorebook("Story Orchestrator - Sun: Ruins?")).toEqual({ name: "Story Orchestrator - Sun Ruins", created: false });
    expect(createNewWorldInfo).toHaveBeenCalledTimes(1);
  });

  it("reports a refused create as a failure", async () => {
    createNewWorldInfo.mockResolvedValueOnce(false);
    expect(await ensureLorebook("Refused")).toBeNull();
    expect(st.disk.has("Refused")).toBe(false);
  });
});

describe("writes resolve the listed name", () => {
  it("disables under the file id a differently cased name resolves to", async () => {
    putOnDisk("Lore", [entry(0, "The bridge")]);
    st.worldNames = ["Lore"];
    expect(await disableWIEntry("LORE", "The bridge")).toEqual({ ok: true, changed: true, confirmed: true });
    expect(saveWorldInfo).toHaveBeenCalledWith("Lore", expect.anything());
    expect(st.disk.get("Lore")!.entries[0].disable).toBe(true);
  });

  it("reports a flip on a missing book as not found", async () => {
    expect(await disableWIEntry("Missing", "The bridge")).toMatchObject({ ok: false });
  });

  // V17: the toggle answered `true` whether or not the lorebook save behind it went through.
  it("a save the host refused is a refused flip", async () => {
    putOnDisk("Lore", [entry(0, "The bridge")]);
    st.worldNames = ["Lore"];
    saveWorldInfo.mockRejectedValueOnce(new Error("disk full"));
    expect(await disableWIEntry("Lore", "The bridge")).toMatchObject({ ok: false, reason: expect.stringContaining("disk full") });
    // ST's worldInfoCache clones on get (world-info.js:882), so a refused save leaves no stale flip and the retry really saves.
    expect(await disableWIEntry("Lore", "The bridge")).toEqual({ ok: true, changed: true, confirmed: true });
    expect(st.disk.get("Lore")!.entries[0].disable).toBe(true);
  });

  it("a save that resolved but never reached the server is a refused flip that names the entry", async () => {
    putOnDisk("Lore", [entry(0, "The bridge")]);
    st.worldNames = ["Lore"];
    server.lose = true;
    expect(await disableWIEntry("Lore", "The bridge")).toMatchObject({ ok: false, reason: expect.stringContaining("The bridge") });
    expect(st.disk.get("Lore")!.entries[0].disable).toBe(false);
    expect((await loadLorebook("Lore"))!.entries[0].disable).toBe(false);
  });

  it("a read-back that cannot answer is an unconfirmed flip, not a refused one", async () => {
    putOnDisk("Lore", [entry(0, "The bridge")]);
    st.worldNames = ["Lore"];
    server.blind = true;
    try {
      expect(await disableWIEntry("Lore", "The bridge")).toEqual({ ok: true, changed: true, confirmed: false });
    } finally {
      server.blind = false;
    }
  });

  it("a flip to the state the entry already holds answers unchanged and saves nothing", async () => {
    putOnDisk("Lore", [{ ...entry(0, "The bridge"), disable: true }]);
    st.worldNames = ["Lore"];
    saveWorldInfo.mockClear();
    expect(await disableWIEntry("Lore", "The bridge")).toEqual({ ok: true, changed: false });
    expect(saveWorldInfo).not.toHaveBeenCalled();
  });

  it("an entry the book does not hold is a refusal that names it", async () => {
    putOnDisk("Lore", [entry(0, "The bridge")]);
    st.worldNames = ["Lore"];
    expect(await disableWIEntry("Lore", "The ferry")).toMatchObject({ ok: false, reason: expect.stringContaining("The ferry") });
  });
});

describe("setWIEntriesState: one write per book (R13)", () => {
  const book = () => st.disk.get("Lore")!.entries;
  beforeEach(() => {
    putOnDisk("Lore", [entry(0, "One"), { ...entry(1, "Two"), disable: true }, entry(2, "Three")]);
    st.worldNames = ["Lore"];
    st.cache.clear();
    saveWorldInfo.mockClear();
  });

  it("applies a book's enables and disables in one save and one read-back", async () => {
    (globalThis.fetch as jest.Mock).mockClear();
    expect(await setWIEntriesState("Lore", { enable: ["Two"], disable: ["One"] })).toEqual({ ok: true, changed: true, confirmed: true });
    expect(saveWorldInfo).toHaveBeenCalledTimes(1);
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    expect({ one: book()[0].disable, two: book()[1].disable, three: book()[2].disable }).toEqual({ one: true, two: false, three: false });
  });

  it("writes nothing when every entry already holds the state asked for", async () => {
    expect(await setWIEntriesState("Lore", { enable: ["One", "Three"], disable: ["Two"] })).toEqual({ ok: true, changed: false });
    expect(saveWorldInfo).not.toHaveBeenCalled();
  });

  it("an entry without a disable key is already on: enabling it writes nothing", async () => {
    const bare = entry(0, "Bare") as Partial<Entry>;
    delete bare.disable;
    putOnDisk("Lore", [bare as Entry]);
    st.cache.clear();
    expect(await setWIEntriesState("Lore", { enable: ["Bare"] })).toEqual({ ok: true, changed: false });
    expect(saveWorldInfo).not.toHaveBeenCalled();
  });

  it("control: disabling an entry without a disable key writes the key", async () => {
    const bare = entry(0, "Bare") as Partial<Entry>;
    delete bare.disable;
    putOnDisk("Lore", [bare as Entry]);
    st.cache.clear();
    expect(await setWIEntriesState("Lore", { disable: ["Bare"] })).toEqual({ ok: true, changed: true, confirmed: true });
    expect(book()[0].disable).toBe(true);
  });

  it("a second identical apply writes nothing", async () => {
    await setWIEntriesState("Lore", { enable: ["Two"], disable: ["One"] });
    saveWorldInfo.mockClear();
    expect(await setWIEntriesState("Lore", { enable: ["Two"], disable: ["One"] })).toEqual({ ok: true, changed: false });
    expect(saveWorldInfo).not.toHaveBeenCalled();
  });

  it("a lost save names the entry it lost, whichever side it was on", async () => {
    server.lose = true;
    expect(await setWIEntriesState("Lore", { enable: ["Two"], disable: ["One"] })).toMatchObject({ ok: false, reason: expect.stringMatching(/One.*Two|Two.*One/) });
  });

  it("enable and disable still answer through the same write", async () => {
    expect(await disableWIEntry("Lore", "One")).toEqual({ ok: true, changed: true, confirmed: true });
    expect(await enableWIEntry("Lore", ["One"])).toEqual({ ok: true, changed: true, confirmed: true });
    expect(saveWorldInfo).toHaveBeenCalledTimes(2);
  });
});

describe("upsertWIEntry identical rewrite (T4-3)", () => {
  it("leaves a switched-off entry with identical text alone by default", async () => {
    putOnDisk("Lore", [{ ...entry(0, "so_1", "Arin trusts Max."), disable: true }]);
    st.worldNames = ["Lore"];
    saveWorldInfo.mockClear();
    expect(await upsertWIEntry("Lore", "so_1", "Arin trusts Max.")).toBe("unchanged");
    expect(saveWorldInfo).not.toHaveBeenCalled();
    expect(st.disk.get("Lore")!.entries[0].disable).toBe(true);
  });

  it("switches an identical entry back on when the writer wants it live", async () => {
    putOnDisk("Lore", [{ ...entry(0, "so_1", "Arin trusts Max."), disable: true }]);
    st.worldNames = ["Lore"];
    expect(await upsertWIEntry("Lore", "so_1", "Arin trusts Max.", [], { live: true })).toBe("updated");
    expect(st.disk.get("Lore")!.entries[0].disable).toBe(false);
  });

  it("an identical live entry that is already on stays unchanged", async () => {
    putOnDisk("Lore", [entry(0, "so_1", "Arin trusts Max.")]);
    st.worldNames = ["Lore"];
    saveWorldInfo.mockClear();
    expect(await upsertWIEntry("Lore", "so_1", "Arin trusts Max.", [], { live: true })).toBe("unchanged");
    expect(saveWorldInfo).not.toHaveBeenCalled();
  });
});

describe("createLorebook (wizard)", () => {
  it("creates the book and leaves it unselected, so it reaches only the chats of its story", async () => {
    expect(await createLorebook("SO-J9 Lore")).toEqual({ ok: true, name: "SO-J9 Lore", created: true });
    expect(st.selected).toEqual([]);
    expect(executeSlashCommands).not.toHaveBeenCalledWith(expect.stringContaining("/world"));
  });

  it("never re-creates a book that exists", async () => {
    putOnDisk("SO-J9 Lore", [entry(0, "Kept")]);
    st.worldNames = ["SO-J9 Lore"];
    expect(await createLorebook("SO-J9 Lore")).toEqual({ ok: true, name: "SO-J9 Lore", created: false });
    expect(st.disk.get("SO-J9 Lore")!.entries[0].comment).toBe("Kept");
  });
});

describe("deactivateGlobalLorebook (story lore migration)", () => {
  it("deselects a selected book by its listed name and reads the selection back", async () => {
    st.worldNames = ["Hoard"];
    st.selected.push("Hoard", "Mine");
    expect(await deactivateGlobalLorebook("hoard")).toEqual({ ok: true, name: "Hoard" });
    expect(st.selected).toEqual(["Mine"]);
  });

  it("answers ok without a command for a book that is not selected", async () => {
    executeSlashCommands.mockClear();
    expect(await deactivateGlobalLorebook("Hoard")).toEqual({ ok: true, name: "Hoard" });
    expect(executeSlashCommands).not.toHaveBeenCalled();
  });

  it("reports a deselect that did not take", async () => {
    st.selected.push("Hoard");
    st.stuck = true;
    expect(await deactivateGlobalLorebook("Hoard")).toEqual({ ok: false, reason: "\"Hoard\" is still selected" });
  });
});

describe("bindChatLorebook", () => {
  beforeEach(() => {
    putOnDisk("Mirror");
    putOnDisk("User Chat Book");
    st.worldNames = ["Mirror", "User Chat Book"];
  });

  it("binds an empty chat slot", () => {
    expect(bindChatLorebook("Mirror")).toBe("bound");
    expect(st.chatMetadata.world_info).toBe("Mirror");
  });

  it("leaves a slot that already holds the book", () => {
    st.chatMetadata.world_info = "mirror";
    expect(bindChatLorebook("Mirror")).toBe("already-bound");
    expect(st.chatMetadata.world_info).toBe("mirror");
  });

  it("never replaces a live book the user bound", () => {
    st.chatMetadata.world_info = "User Chat Book";
    expect(bindChatLorebook("Mirror")).toBe("occupied");
    expect(st.chatMetadata.world_info).toBe("User Chat Book");
  });

  it("treats a binding to a deleted book as empty, like /getchatbook", () => {
    st.chatMetadata.world_info = "Deleted Book";
    expect(bindChatLorebook("Mirror")).toBe("bound");
  });

  it("replaces a book the caller names as its own", () => {
    st.chatMetadata.world_info = "User Chat Book";
    expect(bindChatLorebook("Mirror", ["user chat book"])).toBe("bound");
    expect(st.chatMetadata.world_info).toBe("Mirror");
  });

  it("does nothing without an open chat", () => {
    st.chatId = null;
    expect(bindChatLorebook("Mirror")).toBe("no-chat");
    expect(st.chatMetadata.world_info).toBeUndefined();
  });
});

describe("deleteLorebook (v2.4 T14)", () => {
  beforeEach(() => {
    deleteWorldInfo.mockClear();
    hostDelete.refuse = false;
    hostDelete.keepListed = false;
  });

  it("deletes a listed book and reports it gone from the list and the cache", async () => {
    putOnDisk("Mirror");
    st.worldNames = ["Mirror"];
    await loadLorebook("Mirror");
    expect(await deleteLorebook("Mirror")).toEqual({ ok: true, name: "Mirror" });
    expect(st.worldNames).toEqual([]);
    expect(st.cache.has("Mirror")).toBe(false);
  });

  it("refuses a name that is not listed exactly, without asking the host", async () => {
    putOnDisk("Mirror");
    st.worldNames = ["Mirror"];
    expect((await deleteLorebook("mirror")).ok).toBe(false);
    expect((await deleteLorebook("Missing")).ok).toBe(false);
    expect(deleteWorldInfo).not.toHaveBeenCalled();
    expect(st.disk.has("Mirror")).toBe(true);
  });

  it("reports a refused delete and still evicts what the cache held", async () => {
    putOnDisk("Mirror");
    st.worldNames = ["Mirror"];
    await loadLorebook("Mirror");
    hostDelete.refuse = true;
    expect(await deleteLorebook("Mirror")).toEqual({ ok: false, reason: "\"Mirror\" could not be deleted" });
    expect(st.cache.has("Mirror")).toBe(false);
    expect(st.worldNames).toEqual(["Mirror"]);
  });

  it("does not trust a true answer while the book is still listed", async () => {
    putOnDisk("Mirror");
    st.worldNames = ["Mirror"];
    hostDelete.keepListed = true;
    expect((await deleteLorebook("Mirror")).ok).toBe(false);
  });
});

describe("unbindChatLorebook (v2.4 plan 02 §5)", () => {
  beforeEach(() => { st.saves = 0; });

  it("clears a slot that names exactly the book, and saves", async () => {
    st.chatMetadata.world_info = "Story Orchestrator - Tale - parent";
    await expect(unbindChatLorebook("Story Orchestrator - Tale - parent")).resolves.toEqual({ ok: true, name: "Story Orchestrator - Tale - parent" });
    expect("world_info" in st.chatMetadata).toBe(false);
    expect(st.saves).toBe(1);
  });

  it("refuses, with a reason, a slot that names another book or differs only in case", async () => {
    st.chatMetadata.world_info = "User Chat Book";
    await expect(unbindChatLorebook("Mirror")).resolves.toMatchObject({ ok: false });
    st.chatMetadata.world_info = "mirror";
    await expect(unbindChatLorebook("Mirror")).resolves.toMatchObject({ ok: false });
    expect(st.chatMetadata.world_info).toBe("mirror");
    expect(st.saves).toBe(0);
  });

  it("refuses without an open chat", async () => {
    st.chatId = null;
    st.chatMetadata.world_info = "Mirror";
    await expect(unbindChatLorebook("Mirror")).resolves.toMatchObject({ ok: false });
    expect(st.chatMetadata.world_info).toBe("Mirror");
  });
});

describe("updateWIEntryByUid (v2.4 plan 06 T17.2)", () => {
  beforeEach(() => {
    putOnDisk("Story Lore", [entry(3, "The bridge", "The bridge stands."), { ...entry(5, "The ferry", "Gone."), disable: true }]);
    st.worldNames = ["Story Lore"];
  });

  it("writes content by uid, keeps the entry's own flag, and confirms from the server", async () => {
    await expect(updateWIEntryByUid({ lorebookFileId: "Story Lore", uid: 5 }, { content: "Back." })).resolves.toEqual({ ok: true, confirmed: true });
    expect(st.disk.get("Story Lore")?.entries[5]).toMatchObject({ comment: "The ferry", content: "Back.", disable: true });
  });

  it("flips a flag by uid without touching the text", async () => {
    await expect(updateWIEntryByUid({ lorebookFileId: "Story Lore", uid: 3 }, { disabled: true })).resolves.toMatchObject({ ok: true });
    expect(st.disk.get("Story Lore")?.entries[3]).toMatchObject({ content: "The bridge stands.", disable: true });
  });

  it("never creates: a missing uid is a refusal and the book is not saved", async () => {
    await expect(updateWIEntryByUid({ lorebookFileId: "Story Lore", uid: 9 }, { content: "New." })).resolves.toMatchObject({ ok: false });
    expect(Object.keys(st.disk.get("Story Lore")?.entries ?? {})).toEqual(["3", "5"]);
    expect(saveWorldInfo).not.toHaveBeenCalled();
  });

  it("refuses a book that is not listed", async () => {
    await expect(updateWIEntryByUid({ lorebookFileId: "Missing", uid: 3 }, { content: "x" })).resolves.toMatchObject({ ok: false });
  });

  it("reports a save the server lost", async () => {
    server.lose = true;
    await expect(updateWIEntryByUid({ lorebookFileId: "Story Lore", uid: 3 }, { content: "Lost." })).resolves.toMatchObject({ ok: false });
  });
});

describe("createWIEntry / deleteWIEntryAt (v2.8 11, curator create op)", () => {
  beforeEach(() => {
    putOnDisk("Story Lore", [entry(3, "The bridge", "The bridge stands."), entry(5, "The ferry", "Gone.")]);
    st.worldNames = ["Story Lore"];
  });

  it("creates a keyed, enabled entry in a listed book, returns its uid and confirms from the server", async () => {
    const result = await createWIEntry("Story Lore", { comment: "Old Marn", keys: ["Marn", "map-seller"], content: "Sells the tunnel map." });
    expect(result).toMatchObject({ ok: true, confirmed: true, lorebookFileId: "Story Lore" });
    const uid = result.ok ? result.uid : -1;
    expect(st.disk.get("Story Lore")?.entries[uid]).toMatchObject({ comment: "Old Marn", key: ["Marn", "map-seller"], content: "Sells the tunnel map.", disable: false });
  });

  it("never creates a book: an unlisted name is refused and nothing is saved", async () => {
    await expect(createWIEntry("Missing", { comment: "X", keys: ["x"], content: "x" })).resolves.toMatchObject({ ok: false });
    expect(saveWorldInfo).not.toHaveBeenCalled();
    expect(createNewWorldInfo).not.toHaveBeenCalled();
    expect(st.disk.has("Missing")).toBe(false);
  });

  it("never converts to an edit: an existing title is refused and the entry is untouched", async () => {
    await expect(createWIEntry("Story Lore", { comment: "the bridge", keys: ["bridge"], content: "Fallen." })).resolves.toMatchObject({ ok: false });
    expect(st.disk.get("Story Lore")?.entries[3]).toMatchObject({ content: "The bridge stands." });
    expect(saveWorldInfo).not.toHaveBeenCalled();
  });

  it("reports a create the server lost", async () => {
    server.lose = true;
    await expect(createWIEntry("Story Lore", { comment: "Old Marn", keys: ["Marn"], content: "x" })).resolves.toMatchObject({ ok: false });
  });

  it("deletes by uid and confirms the server no longer holds it; a missing uid is a refusal", async () => {
    await expect(deleteWIEntryAt({ lorebookFileId: "Story Lore", uid: 5 })).resolves.toEqual({ ok: true, confirmed: true });
    expect(Object.keys(st.disk.get("Story Lore")?.entries ?? {})).toEqual(["3"]);
    await expect(deleteWIEntryAt({ lorebookFileId: "Story Lore", uid: 5 })).resolves.toMatchObject({ ok: false });
  });

  it("reports a delete the server lost", async () => {
    server.lose = true;
    await expect(deleteWIEntryAt({ lorebookFileId: "Story Lore", uid: 3 })).resolves.toMatchObject({ ok: false });
  });
});
