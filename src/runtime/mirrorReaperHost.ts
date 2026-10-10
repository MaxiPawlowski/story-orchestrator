import { askConfirm, deleteLorebook, deleteWIEntryAt, listAllLorebooks, loadLorebook, probeChatFile, readWIEntry, readWIEntryAt, subscribeToHostEvents } from "@services/STAPI";
import { lorebookFileId } from "@utils/string";
import { CreatedEntryReaper, createdReapQuestion, type LoreEntryRead, type StampedEntry } from "./createdReaper";
import { lifetimeOwnership, MirrorReaper, orphanRegistry, OWNER_COMMENT, reapLog, reapQuestion } from "./mirrorReaper";
import { listStoryRecords } from "./storyLibrary";
import { log } from "@utils/log";

// The reaper's host wiring, kept out of `mirrorReaper.ts` so the decision stays
// importable in jest. ST's `emit` awaits every listener in turn (lib/eventemitter.js:146), so the
// handler must not hold the event on the confirm: `deleteGroup` would sit in its announce loop, before
// its own `response.ok` check, until the player answered.
const reapContent = (book: string, chatId: string, title: string | null) => (doc: Document): HTMLElement => {
  const root = doc.createElement("div");
  root.setAttribute("data-so-reap-chat", chatId);
  const question = doc.createElement("p");
  question.textContent = reapQuestion(book, chatId, title);
  const name = doc.createElement("p");
  name.style.opacity = "0.7";
  name.textContent = `Lorebook: ${book}`;
  root.append(question, name);
  return root;
};

const createdContent = (chatId: string, entries: StampedEntry[]) => (doc: Document): HTMLElement => {
  const root = doc.createElement("div");
  root.setAttribute("data-so-reap-chat", chatId);
  root.setAttribute("data-so-reap-kind", "created");
  const question = doc.createElement("p");
  question.textContent = createdReapQuestion(chatId, entries);
  root.append(question);
  return root;
};

const curatorBooks = (): string[] => listStoryRecords().flatMap((record) => {
  const stagecraft = (record.raw as { stagecraft?: { lorebooks?: unknown } }).stagecraft;
  return Array.isArray(stagecraft?.lorebooks) ? stagecraft.lorebooks.filter((book): book is string => typeof book === "string") : [];
});

const entryRead = (raw: unknown): LoreEntryRead | null => {
  const entry = raw as { uid?: unknown; comment?: unknown; content?: unknown } | null;
  return entry && Number.isInteger(entry.uid) && typeof entry.content === "string"
    ? { uid: entry.uid as number, comment: typeof entry.comment === "string" ? entry.comment : "", content: entry.content }
    : null;
};

export function startMirrorReaper(notify: () => void): () => void {
  const lifetime = lifetimeOwnership();
  orphanRegistry.watch((name) => listAllLorebooks().includes(name));
  const reaper = new MirrorReaper({
    listLorebooks: listAllLorebooks,
    readMarker: async (book) => (await readWIEntry(book, OWNER_COMMENT))?.content ?? null,
    probeChat: probeChatFile,
    confirm: (book, chatId, title) => askConfirm(reapContent(book, chatId, title), { okButton: "Delete lorebook", cancelButton: "Keep it", safeDefault: true }),
    deleteLorebook,
    notify,
    record: (decision) => reapLog.note(decision),
    ownership: lifetime.ownership,
  });
  const created = new CreatedEntryReaper({
    books: curatorBooks,
    listLorebooks: listAllLorebooks,
    loadEntries: async (book) => {
      const loaded = await loadLorebook(book);
      return loaded?.entries ? Object.values(loaded.entries).map(entryRead).filter((entry): entry is LoreEntryRead => entry !== null) : null;
    },
    readEntryAt: async (book, uid) => entryRead(await readWIEntryAt({ lorebookFileId: lorebookFileId(book), uid })),
    probeChat: probeChatFile,
    confirm: (chatId, entries) => askConfirm(createdContent(chatId, entries), { okButton: "Delete entries", cancelButton: "Keep them", safeDefault: true }),
    deleteEntry: (book, uid) => deleteWIEntryAt({ lorebookFileId: lorebookFileId(book), uid }),
    notify,
    record: (decision) => reapLog.note(decision),
    ownership: lifetime.ownership,
  });
  let queue: Promise<unknown> = Promise.resolve();
  const onDeleted = (chatId: unknown) => {
    if (typeof chatId !== "string") return;
    queue = queue
      .then(() => reaper.onChatDeleted(chatId).catch((error) => log.warn("mirror reap failed", error)))
      .then(() => created.onChatDeleted(chatId).catch((error) => log.warn("created-entry reap failed", error)));
  };
  const unsubscribe = subscribeToHostEvents([
    { eventName: "CHAT_DELETED", handler: onDeleted },
    { eventName: "GROUP_CHAT_DELETED", handler: onDeleted },
  ]);
  return () => {
    unsubscribe();
    lifetime.end();
    orphanRegistry.watch(null);
  };
}
