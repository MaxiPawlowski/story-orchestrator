import type { ChatOwner, ChatPresence, ConfirmAnswer } from "@services/STAPI";
import { couldNot, wrote } from "@utils/writeResult";
import {
  deletedChatLabel, lifetimeOwnership, MirrorReaper, OrphanRegistry, ownerMarkerContent, parseOwnerMarker, reapCandidates, reapQuestion, type MirrorReaperDeps,
} from "./mirrorReaper";
import { mirrorLorebookName } from "./memoryMirror";
import { beginRun } from "./runToken";
import { testOwnership } from "../../test/findings/testOwnership";

// v2.4 plan 02 T14. The reap deletes a lorebook, and ST announces a group chat's deletion before it knows
// whether the delete worked (02-H11). Every guard below has a case that fails without it.

const GROUP = "grp-1";
const owner = (chatId: string, patch: Partial<ChatOwner> = {}): ChatOwner => ({ chatId, integrity: "i-1", groupId: GROUP, avatar: null, ...patch });
const marker = (chatId: string, patch: Partial<ChatOwner> = {}) => ownerMarkerContent(owner(chatId, patch), "2026-09-24T00:00:00.000Z");

interface World {
  books: Map<string, string | null>;
  presence: Map<string, ChatPresence>;
  answer: boolean | ConfirmAnswer | (() => Promise<boolean | ConfirmAnswer>);
}

const asAnswer = (value: boolean | ConfirmAnswer): ConfirmAnswer => (value === true ? "confirmed" : value === false ? "declined" : value);

const harness = (world: Partial<World> = {}, patch: Partial<MirrorReaperDeps> = {}) => {
  const state: World = { books: new Map(), presence: new Map(), answer: true, ...world };
  const registry = new OrphanRegistry();
  const calls = { confirmed: [] as string[], deleted: [] as string[], probed: [] as string[], notified: 0, journal: [] as string[] };
  const deps: MirrorReaperDeps = {
    listLorebooks: () => [...state.books.keys()],
    readMarker: async (book) => state.books.get(book) ?? null,
    probeChat: async (ref) => {
      calls.probed.push(ref.chatId);
      return state.presence.get(ref.chatId) ?? "unknown";
    },
    confirm: async (book) => {
      calls.confirmed.push(book);
      return asAnswer(typeof state.answer === "function" ? await state.answer() : state.answer);
    },
    deleteLorebook: async (name) => {
      calls.deleted.push(name);
      state.books.delete(name);
      return wrote({ name });
    },
    notify: () => { calls.notified += 1; },
    journal: (summary) => { calls.journal.push(summary); },
    registry,
    ownership: testOwnership(),
    ...patch,
  };
  return { reaper: new MirrorReaper(deps), state, calls, registry };
};

const bookOf = (chatId: string, title = "Crossing") => mirrorLorebookName(title, chatId);

describe("v2.4 T14: reapCandidates", () => {
  it("matches the chat id as an exact suffix, so chat -12 never nominates chat -123's book", () => {
    const books = [bookOf("chat-12"), bookOf("chat-123"), bookOf("xchat-12")];
    expect(reapCandidates(books, "chat-12")).toEqual([bookOf("chat-12")]);
    expect(reapCandidates(books, "chat-123")).toEqual([bookOf("chat-123")]);
  });

  it("nominates only mirror books, never a user book that happens to end the same way", () => {
    expect(reapCandidates(["My notes - chat-12", bookOf("chat-12")], "chat-12")).toEqual([bookOf("chat-12")]);
  });

  it("matches the listed file id, which drops characters the server refuses in a filename", () => {
    expect(reapCandidates(["Story Orchestrator - Crossing - Ann - 2026-09-24@10h00m"], "Ann: - 2026-09-24@10h00m")).toEqual(["Story Orchestrator - Crossing - Ann - 2026-09-24@10h00m"]);
  });

  it("nominates nothing for an empty id", () => {
    expect(reapCandidates([bookOf("")], "")).toEqual([]);
  });
});

describe("v2.4 T14: the so-owner marker", () => {
  it("round-trips the chat it names", () => {
    expect(parseOwnerMarker(marker("chat-b"))).toMatchObject({ owner: "story-orchestrator", chatId: "chat-b", integrity: "i-1", groupId: GROUP, avatar: null });
  });

  it("refuses another owner, a missing chat id and non-JSON", () => {
    expect(parseOwnerMarker(JSON.stringify({ owner: "someone-else", chatId: "chat-b" }))).toBeNull();
    expect(parseOwnerMarker(JSON.stringify({ owner: "story-orchestrator" }))).toBeNull();
    expect(parseOwnerMarker("Arin owes Max a favour.")).toBeNull();
    expect(parseOwnerMarker(null)).toBeNull();
  });
});

describe("v2.4 T14: MirrorReaper", () => {
  it("deletes a marked book whose chat is confirmed gone, after the player says yes", async () => {
    const book = bookOf("chat-b");
    const { reaper, state, calls, registry } = harness({ books: new Map([[book, marker("chat-b")]]), presence: new Map([["chat-b", "absent"]]) });
    expect(await reaper.onChatDeleted("chat-b")).toEqual([{ book, result: "deleted" }]);
    expect(calls.confirmed).toEqual([book]);
    expect(calls.deleted).toEqual([book]);
    expect(state.books.has(book)).toBe(false);
    expect(registry.list()).toEqual([]);
  });

  it("never reaps a book without a marker, and leaves a Repair row instead", async () => {
    const book = bookOf("chat-b");
    const { reaper, calls, registry } = harness({ books: new Map([[book, null]]), presence: new Map([["chat-b", "absent"]]) });
    expect(await reaper.onChatDeleted("chat-b")).toEqual([{ book, result: "no-marker" }]);
    expect(calls.confirmed).toEqual([]);
    expect(calls.deleted).toEqual([]);
    expect(registry.list()).toEqual([expect.objectContaining({ name: book, chatId: "chat-b", reason: "no-marker" })]);
  });

  it("never reaps a book whose so-owner entry was written by someone else", async () => {
    const book = bookOf("chat-b");
    const forged = JSON.stringify({ owner: "another-extension", chatId: "chat-b", groupId: GROUP });
    const { reaper, calls, registry } = harness({ books: new Map([[book, forged]]), presence: new Map([["chat-b", "absent"]]) });
    expect(await reaper.onChatDeleted("chat-b")).toEqual([{ book, result: "no-marker" }]);
    expect(calls.confirmed).toEqual([]);
    expect(calls.deleted).toEqual([]);
    expect(registry.list()).toEqual([expect.objectContaining({ name: book, reason: "no-marker" })]);
  });

  it("never reaps a book whose marker names another chat, even when the name matches", async () => {
    const book = "Story Orchestrator - Crossing - Ann - chat-b";
    const { reaper, calls, registry } = harness({ books: new Map([[book, marker("Ann - chat-b")]]), presence: new Map([["chat-b", "absent"], ["Ann - chat-b", "absent"]]) });
    expect(await reaper.onChatDeleted("chat-b")).toEqual([{ book, result: "not-ours" }]);
    expect(calls.probed).toEqual([]);
    expect(calls.confirmed).toEqual([]);
    expect(calls.deleted).toEqual([]);
    expect(registry.list()).toEqual([]);
  });

  it("refuses an announce-without-delete (02-H11): the chat still exists, so nothing is offered", async () => {
    const book = bookOf("chat-b");
    const { reaper, calls, registry } = harness({ books: new Map([[book, marker("chat-b")]]), presence: new Map([["chat-b", "present"]]) });
    expect(await reaper.onChatDeleted("chat-b")).toEqual([{ book, result: "chat-present" }]);
    expect(calls.probed).toEqual(["chat-b"]);
    expect(calls.confirmed).toEqual([]);
    expect(calls.deleted).toEqual([]);
    expect(registry.list()).toEqual([]);
  });

  it("asks the probe about the chat the marker records, group and solo alike", async () => {
    const seen: Array<Pick<ChatOwner, "chatId" | "groupId" | "avatar">> = [];
    const solo = bookOf("Ann - chat-s");
    const { reaper } = harness({ books: new Map([[solo, marker("Ann - chat-s", { groupId: null, avatar: "Ann.png" })]]) }, {
      probeChat: async (ref) => { seen.push({ chatId: ref.chatId, groupId: ref.groupId, avatar: ref.avatar }); return "present"; },
    });
    await reaper.onChatDeleted("Ann - chat-s");
    expect(seen).toEqual([{ chatId: "Ann - chat-s", groupId: null, avatar: "Ann.png" }]);
  });

  it("turns a deletion it cannot confirm into a Repair row, never a delete", async () => {
    const book = bookOf("chat-b");
    const { reaper, calls, registry } = harness({ books: new Map([[book, marker("chat-b")]]), presence: new Map([["chat-b", "unknown"]]) });
    expect(await reaper.onChatDeleted("chat-b")).toEqual([{ book, result: "unverifiable" }]);
    expect(calls.confirmed).toEqual([]);
    expect(calls.deleted).toEqual([]);
    expect(registry.list()).toEqual([expect.objectContaining({ name: book, reason: "unverifiable" })]);
  });

  it("requires the player's yes: a declined reap keeps the book, journals the choice and leaves no Repair row", async () => {
    const book = bookOf("2026-10-02@01h58m58s371ms");
    const { reaper, state, calls, registry } = harness({ books: new Map([[book, marker("2026-10-02@01h58m58s371ms")]]), presence: new Map([["2026-10-02@01h58m58s371ms", "absent"]]), answer: false });
    expect(await reaper.onChatDeleted("2026-10-02@01h58m58s371ms")).toEqual([{ book, result: "declined" }]);
    expect(calls.confirmed).toEqual([book]);
    expect(calls.deleted).toEqual([]);
    expect(state.books.has(book)).toBe(true);
    expect(registry.list()).toEqual([]);
    expect(calls.journal).toEqual(['Kept the story-memory lorebook of the "Crossing" chat started 2026-10-02 01:58.']);
  });

  it("journals a dismissed question as kept, and tells it apart from a declined one (T4-3)", async () => {
    const book = bookOf("chat-b");
    const { reaper, calls, registry } = harness({ books: new Map([[book, marker("chat-b")]]), presence: new Map([["chat-b", "absent"]]), answer: "dismissed" });
    expect(await reaper.onChatDeleted("chat-b")).toEqual([{ book, result: "dismissed" }]);
    expect(calls.deleted).toEqual([]);
    expect(registry.list()).toEqual([]);
    expect(calls.journal).toEqual(['Kept the story-memory lorebook of the "Crossing" chat "chat-b": the question was closed without an answer.']);
  });

  it("journals a delete and a Repair row too (T4-3)", async () => {
    const deleted = bookOf("chat-a");
    const refused = bookOf("chat-b");
    const { reaper, calls } = harness({ books: new Map([[deleted, marker("chat-a")], [refused, marker("chat-b")]]), presence: new Map([["chat-a", "absent"], ["chat-b", "absent"]]) }, {
      deleteLorebook: async (name) => (name === refused ? couldNot("the host refused") : wrote({ name })),
    });
    await reaper.onChatDeleted("chat-a");
    await reaper.onChatDeleted("chat-b");
    expect(calls.journal).toEqual([
      'Deleted the story-memory lorebook of the "Crossing" chat "chat-a".',
      'Left the story-memory lorebook of the "Crossing" chat "chat-b": the host refused.',
    ]);
  });

  it("leaves no row and attempts no delete when the book was deleted elsewhere while the confirm was open", async () => {
    const book = bookOf("chat-b");
    const world = harness({ books: new Map([[book, marker("chat-b")]]), presence: new Map([["chat-b", "absent"]]) });
    world.state.answer = async () => { world.state.books.delete(book); return false; };
    expect(await world.reaper.onChatDeleted("chat-b")).toEqual([{ book, result: "gone" }]);
    expect(world.calls.deleted).toEqual([]);
    expect(world.registry.list()).toEqual([]);
  });

  it("reads a book deleted before its marker could be read as gone, not as an unmarked orphan", async () => {
    const book = bookOf("chat-b");
    const world = harness({ books: new Map([[book, marker("chat-b")]]), presence: new Map([["chat-b", "absent"]]) }, {
      readMarker: async () => { world.state.books.delete(book); return null; },
    });
    expect(await world.reaper.onChatDeleted("chat-b")).toEqual([{ book, result: "gone" }]);
    expect(world.calls.confirmed).toEqual([]);
    expect(world.registry.list()).toEqual([]);
  });

  it("deletes nothing once the runtime stopped while the confirm was open", async () => {
    const book = bookOf("chat-b");
    const lifetime = lifetimeOwnership();
    const { reaper, calls, registry } = harness({
      books: new Map([[book, marker("chat-b")]]),
      presence: new Map([["chat-b", "absent"]]),
      answer: async () => { lifetime.end(); return true; },
    }, { ownership: lifetime.ownership });
    expect(await reaper.onChatDeleted("chat-b")).toEqual([{ book, result: "lapsed" }]);
    expect(calls.deleted).toEqual([]);
    expect(registry.list()).toEqual([expect.objectContaining({ name: book, reason: "lapsed" })]);
  });

  it("reports a refused delete as a Repair row with the host's reason", async () => {
    const book = bookOf("chat-b");
    const { reaper, registry } = harness({ books: new Map([[book, marker("chat-b")]]), presence: new Map([["chat-b", "absent"]]) }, {
      deleteLorebook: async () => couldNot("the host refused"),
    });
    expect(await reaper.onChatDeleted("chat-b")).toEqual([{ book, result: "delete-failed" }]);
    expect(registry.list()).toEqual([{ name: book, chatId: "chat-b", reason: "delete-failed", detail: "the host refused", label: 'the "Crossing" chat "chat-b"' }]);
  });

  it("clears a book's Repair row once a later reap deletes it", async () => {
    const book = bookOf("chat-b");
    let refuse = true;
    const world = harness({ books: new Map([[book, marker("chat-b")]]), presence: new Map([["chat-b", "absent"]]) }, {
      deleteLorebook: async (name) => (refuse ? couldNot("the host refused") : wrote({ name })),
    });
    await world.reaper.onChatDeleted("chat-b");
    expect(world.registry.list()).toHaveLength(1);
    refuse = false;
    await world.reaper.onChatDeleted("chat-b");
    expect(world.registry.list()).toEqual([]);
  });

  it("asks one question at a time when a group delete announces several chats", async () => {
    const books = new Map([[bookOf("chat-a"), marker("chat-a")], [bookOf("chat-b"), marker("chat-b")]]);
    let open = 0;
    let most = 0;
    const { reaper, calls } = harness({
      books,
      presence: new Map([["chat-a", "absent"], ["chat-b", "absent"]]),
      answer: async () => {
        open += 1;
        most = Math.max(most, open);
        await new Promise((resolve) => setTimeout(resolve, 5));
        open -= 1;
        return true;
      },
    });
    await Promise.all([reaper.onChatDeleted("chat-a"), reaper.onChatDeleted("chat-b")]);
    expect(most).toBe(1);
    expect(calls.deleted).toEqual([bookOf("chat-a"), bookOf("chat-b")]);
  });

  it("hostDeletes|duplicateCompletion (CR-P22): the same deletion announced twice asks once and deletes once", async () => {
    const book = bookOf("chat-a");
    const { reaper, calls } = harness({ books: new Map([[book, marker("chat-a")]]), presence: new Map([["chat-a", "absent"]]) });
    await Promise.all([reaper.onChatDeleted("chat-a"), reaper.onChatDeleted("chat-a")]);
    await reaper.onChatDeleted("chat-a");
    expect(calls.confirmed).toEqual([book]);
    expect(calls.deleted).toEqual([book]);
  });

  it("keeps serving events after one reap throws", async () => {
    const book = bookOf("chat-b");
    const { reaper, calls } = harness({ books: new Map([[book, marker("chat-b")]]), presence: new Map([["chat-b", "absent"]]) }, {
      readMarker: jest.fn().mockRejectedValueOnce(new Error("read failed")).mockResolvedValue(marker("chat-b")),
    });
    await expect(reaper.onChatDeleted("chat-b")).rejects.toThrow("read failed");
    expect(await reaper.onChatDeleted("chat-b")).toEqual([{ book, result: "deleted" }]);
    expect(calls.deleted).toEqual([book]);
  });
});

describe("T4-3: the reap question reads as the player's chat, not as file names", () => {
  it("names the story and when a group chat started", () => {
    const book = mirrorLorebookName("Adolion Between the Roads", "2026-10-02@01h58m58s371ms");
    expect(deletedChatLabel(book, "2026-10-02@01h58m58s371ms")).toBe('the "Adolion Between the Roads" chat started 2026-10-02 01:58');
  });

  it("names the character of a solo chat", () => {
    const book = mirrorLorebookName("Crossing", "Akari - 2026-10-02@03h12m49s146ms");
    expect(deletedChatLabel(book, "Akari - 2026-10-02@03h12m49s146ms")).toBe('the "Crossing" chat with Akari started 2026-10-02 03:12');
  });

  it("falls back to the chat's name when it carries no date", () => {
    expect(deletedChatLabel("My notes", "renamed chat")).toBe('the chat "renamed chat"');
  });

  it("leads with the readable chat, never with the raw id", () => {
    const question = reapQuestion(mirrorLorebookName("Crossing", "2026-10-02@01h58m58s371ms"), "2026-10-02@01h58m58s371ms");
    expect(question.startsWith('You deleted the "Crossing" chat started 2026-10-02 01:58.')).toBe(true);
    expect(question).not.toContain("01h58m58s371ms");
    expect(question).toContain("cannot be undone");
  });
});

describe("v2.4 T14: OrphanRegistry", () => {
  it("hides a row whose book the host no longer lists, and shows every row without a listing", () => {
    const registry = new OrphanRegistry();
    registry.note({ name: "kept", chatId: "a", reason: "lapsed", detail: "" });
    registry.note({ name: "deleted-by-hand", chatId: "b", reason: "lapsed", detail: "" });
    expect(registry.list().map((row) => row.name)).toEqual(["kept", "deleted-by-hand"]);
    registry.watch((name) => name === "kept");
    expect(registry.list().map((row) => row.name)).toEqual(["kept"]);
    registry.watch(null);
    expect(registry.list()).toHaveLength(2);
  });
});

describe("v2.4 T14: lifetimeOwnership", () => {
  it("holds until the runtime ends, and a run minted after the end holds again", () => {
    const lifetime = lifetimeOwnership();
    const before = beginRun(lifetime.ownership);
    expect(before.stillOwns()).toBe(true);
    lifetime.end();
    expect(before.stillOwns()).toBe(false);
    expect(beginRun(lifetime.ownership).stillOwns()).toBe(true);
  });
});
