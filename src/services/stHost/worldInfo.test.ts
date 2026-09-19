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
  chatMetadata: {} as Record<string, unknown>,
  chatId: "chat-1" as string | null,
};
const fileId = (name: string) => name.replace(/[/?<>\\:*|"]/g, "");
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

const loadWorldInfo = jest.fn(async (name: string) => {
  if (!st.cache.has(name)) st.cache.set(name, clone(st.disk.get(fileId(name)) ?? { entries: {} }));
  return clone(st.cache.get(name));
});
const saveWorldInfo = jest.fn(async (name: string, data: Book) => {
  st.cache.set(name, data);
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
const executeSlashCommands = jest.fn(async (command: string) => {
  const name = command.replace("/world silent=true state=on ", "").replace(/^"|"$/g, "");
  if (st.worldNames.includes(name)) st.selected.push(name);
  return true;
});

jest.mock("./context", () => ({
  getContext: () => ({
    loadWorldInfo: (name: string) => loadWorldInfo(name),
    saveWorldInfo: (name: string, data: Book) => saveWorldInfo(name, data),
    getWorldInfoNames: () => st.worldNames,
    chatMetadata: st.chatMetadata,
    chatId: st.chatId,
  }),
}));

jest.mock("./modules", () => ({
  worldInfoModule: {
    METADATA_KEY: "world_info",
    get selected_world_info() { return st.selected; },
    getWorldInfoSettings: () => ({}),
    updateWorldInfoList: () => updateWorldInfoList(),
    createNewWorldInfo: (name: string) => createNewWorldInfo(name),
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

import { bindChatLorebook, createLorebook, disableWIEntry, ensureLorebook, loadLorebook, lorebookExists, upsertWIEntry } from "./worldInfo";

const putOnDisk = (name: string, entries: Entry[] = []) => st.disk.set(name, { entries: Object.fromEntries(entries.map((entry) => [entry.uid, entry])) });
const entry = (uid: number, comment: string, content = "text"): Entry => ({ uid, comment, content, key: [], disable: false });

beforeEach(() => {
  st.disk.clear();
  st.cache.clear();
  st.worldNames = [];
  st.selected.length = 0;
  for (const key of Object.keys(st.chatMetadata)) delete st.chatMetadata[key];
  st.chatId = "chat-1";
  jest.spyOn(console, "warn").mockImplementation(() => undefined);
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
    expect(await disableWIEntry("LORE", "The bridge")).toBe(true);
    expect(saveWorldInfo).toHaveBeenCalledWith("Lore", expect.anything());
    expect(st.disk.get("Lore")!.entries[0].disable).toBe(true);
  });

  it("reports a flip on a missing book as not found", async () => {
    expect(await disableWIEntry("Missing", "The bridge")).toBe(false);
  });
});

describe("createLorebook (wizard)", () => {
  it("creates and switches the book on globally", async () => {
    expect(await createLorebook("SO-J9 Lore")).toEqual({ created: true, activated: true });
    expect(st.selected).toEqual(["SO-J9 Lore"]);
  });

  it("never re-creates a book that exists", async () => {
    putOnDisk("SO-J9 Lore", [entry(0, "Kept")]);
    st.worldNames = ["SO-J9 Lore"];
    expect(await createLorebook("SO-J9 Lore")).toEqual({ created: false, activated: true });
    expect(st.disk.get("SO-J9 Lore")!.entries[0].comment).toBe("Kept");
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
