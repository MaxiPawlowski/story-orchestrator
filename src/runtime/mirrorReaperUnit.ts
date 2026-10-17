import { askConfirm, deleteLorebook, deleteWIEntryAt, listAllLorebooks, loadLorebook, probeChatFile, readWIEntry, readWIEntryAt } from "@services/STAPI";
import { lorebookFileId } from "@utils/string";
import { CreatedEntryReaper, createdReapQuestion, type LoreEntryRead, type StampedEntry } from "./createdReaper";
import { OWNER_COMMENT, reapLog, reapQuestion } from "./mirrorReaper";
import { MirrorReaper } from "./mirrorReaperCore";
import type { RunOwnership } from "./runToken";
import { listStoryRecords } from "./storyLibrary";

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

export const buildReapers = (notify: () => void, lifetime: { ownership: RunOwnership }) => {
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
    deleteEntry: (book, uid, guard) => deleteWIEntryAt({ lorebookFileId: lorebookFileId(book), uid }, guard),
    notify,
    record: (decision) => reapLog.note(decision),
    ownership: lifetime.ownership,
  });
  return { reaper, created };
};
