import type { ChatPresence, ConfirmAnswer } from "@services/STAPI";
import { createdStamp } from "@stagecraft/index";
import { CreatedEntryReaper, createdReapQuestion, type LoreEntryRead } from "./createdReaper";
import { lifetimeOwnership, type ReapDecision } from "./mirrorReaper";

const CHAT = "2026-10-10@12h00m00s";
const stamp = (chatId: string) => createdStamp({ chatId, groupId: "g-1" });

const fixture = (options: { presence?: ChatPresence; answer?: ConfirmAnswer; books?: string[]; onConfirm?: () => void } = {}) => {
  const lore = new Map<string, LoreEntryRead[]>([
    ["Story Lore", [
      { uid: 0, comment: "The Delta", content: "Reeds." },
      { uid: 1, comment: "Oskar", content: `Boatwright.\n${stamp(CHAT)}` },
      { uid: 2, comment: "Pier", content: `Rotten.\n${stamp("2026-10-11@09h00m00s")}` },
      { uid: 3, comment: "Oskar's Yard", content: `Yard.\n${stamp(CHAT)}` },
    ]],
    ["Unlisted Lore", [{ uid: 0, comment: "Ghost", content: `x\n${stamp(CHAT)}` }]],
  ]);
  const deleted: string[] = [];
  const decisions: ReapDecision[] = [];
  const confirm = jest.fn(async () => { options.onConfirm?.(); return options.answer ?? "confirmed"; });
  const probe = jest.fn(async () => options.presence ?? "absent");
  const lifetime = lifetimeOwnership();
  const reaper = new CreatedEntryReaper({
    books: () => options.books ?? ["Story Lore", "Story Lore", "Unlisted Lore", "Missing Lore"],
    listLorebooks: () => ["Story Lore", "Other"],
    loadEntries: async (book) => lore.get(book) ?? null,
    readEntryAt: async (book, uid) => lore.get(book)?.find((entry) => entry.uid === uid) ?? null,
    probeChat: probe,
    confirm,
    deleteEntry: async (book, uid) => {
      deleted.push(`${book}#${String(uid)}`);
      lore.set(book, (lore.get(book) ?? []).filter((entry) => entry.uid !== uid));
      return { ok: true, confirmed: true };
    },
    notify: () => undefined,
    record: (decision) => decisions.push(decision),
    now: () => "2026-10-10T12:00:00Z",
    ownership: lifetime.ownership,
  });
  return { reaper, lore, deleted, decisions, confirm, probe, lifetime };
};

describe("v2.8 A16: a deleted chat's curator-created entries are offered for removal, never removed silently", () => {
  it("asks once, names every stamped entry, and deletes only the ones stamped for that chat", async () => {
    const env = fixture();
    const outcome = await env.reaper.onChatDeleted(CHAT);
    expect(env.confirm).toHaveBeenCalledTimes(1);
    expect(env.confirm.mock.calls[0]).toEqual([CHAT, [
      { book: "Story Lore", uid: 1, comment: "Oskar", groupId: "g-1" },
      { book: "Story Lore", uid: 3, comment: "Oskar's Yard", groupId: "g-1" },
    ]]);
    expect(env.probe).toHaveBeenCalledWith({ chatId: CHAT, groupId: "g-1", avatar: null });
    expect(outcome.result).toBe("deleted");
    expect(env.deleted).toEqual(["Story Lore#1", "Story Lore#3"]);
    expect(env.lore.get("Story Lore")!.map((entry) => entry.comment)).toEqual(["The Delta", "Pier"]);
    expect(env.decisions.at(-1)).toMatchObject({ chatId: CHAT, result: "deleted", summary: expect.stringContaining("Deleted 2 curator-created lorebook entries") });
  });

  it("the question says what it will and will not touch", () => {
    const text = createdReapQuestion(CHAT, [{ book: "Story Lore", uid: 1, comment: "Oskar", groupId: null }]);
    expect(text).toContain("“Oskar” (Story Lore)");
    expect(text).toContain("Entries the curator did not create for this chat are never touched");
  });

  it.each([["declined"], ["dismissed"]] as const)("a %s question keeps every entry and is journaled", async (answer) => {
    const env = fixture({ answer });
    expect((await env.reaper.onChatDeleted(CHAT)).result).toBe(answer);
    expect(env.deleted).toEqual([]);
    expect(env.decisions.at(-1)).toMatchObject({ result: answer, summary: expect.stringContaining("Kept") });
  });

  it("a chat that still exists, or one whose deletion cannot be confirmed, is never asked about", async () => {
    for (const presence of ["present", "unknown"] as ChatPresence[]) {
      const env = fixture({ presence });
      await env.reaper.onChatDeleted(CHAT);
      expect(env.confirm).not.toHaveBeenCalled();
      expect(env.deleted).toEqual([]);
    }
  });

  it("a chat with no stamped entry asks nothing and probes nothing", async () => {
    const env = fixture();
    expect((await env.reaper.onChatDeleted("2026-01-01@00h00m00s")).result).toBe("none");
    expect(env.probe).not.toHaveBeenCalled();
    expect(env.confirm).not.toHaveBeenCalled();
  });

  it("an entry whose stamp was removed while the question was open is kept", async () => {
    const env = fixture({ onConfirm: () => { env.lore.get("Story Lore")![1].content = "Boatwright, edited by the author."; } });
    const outcome = await env.reaper.onChatDeleted(CHAT);
    expect(env.deleted).toEqual(["Story Lore#3"]);
    expect(outcome.kept.map((entry) => entry.comment)).toEqual(["Oskar"]);
  });

  it("nothing is deleted after the runtime stopped while the question was open", async () => {
    const env = fixture({ onConfirm: () => env.lifetime.end() });
    expect((await env.reaper.onChatDeleted(CHAT)).result).toBe("delete-failed");
    expect(env.deleted).toEqual([]);
  });

  it("only listed curator books are read: an unlisted book's stamped entry is never offered", async () => {
    const env = fixture({ books: ["Unlisted Lore"] });
    expect((await env.reaper.onChatDeleted(CHAT)).result).toBe("none");
    expect(env.deleted).toEqual([]);
  });
});
