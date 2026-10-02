import { askConfirm, deleteLorebook, listAllLorebooks, probeChatFile, readWIEntry, subscribeToHostEvents } from "@services/STAPI";
import { lifetimeOwnership, MirrorReaper, orphanRegistry, OWNER_COMMENT, reapLog, reapQuestion } from "./mirrorReaper";
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
  const onDeleted = (chatId: unknown) => {
    if (typeof chatId !== "string") return;
    reaper.onChatDeleted(chatId).catch((error) => log.warn("mirror reap failed", error));
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
