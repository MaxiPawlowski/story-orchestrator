import { deleteLorebook, listAllLorebooks, probeChatFile, readWIEntry, showConfirmPopup, subscribeToHostEvents } from "@services/STAPI";
import { lifetimeOwnership, MirrorReaper, orphanRegistry, OWNER_COMMENT } from "./mirrorReaper";

// The reaper's host wiring, kept out of `mirrorReaper.ts` so the decision stays
// importable in jest. ST's `emit` awaits every listener in turn (lib/eventemitter.js:146), so the
// handler must not hold the event on the confirm: `deleteGroup` would sit in its announce loop, before
// its own `response.ok` check, until the player answered.
export function startMirrorReaper(notify: () => void): () => void {
  const lifetime = lifetimeOwnership();
  orphanRegistry.watch((name) => listAllLorebooks().includes(name));
  const reaper = new MirrorReaper({
    listLorebooks: listAllLorebooks,
    readMarker: async (book) => (await readWIEntry(book, OWNER_COMMENT))?.content ?? null,
    probeChat: probeChatFile,
    confirm: (book, chatId) => showConfirmPopup(
      `The chat "${chatId}" was deleted, but its story-memory lorebook "${book}" is still there. Delete the lorebook too? This cannot be undone.`,
      { okButton: "Delete lorebook", cancelButton: "Keep it" },
    ),
    deleteLorebook,
    notify,
    ownership: lifetime.ownership,
  });
  const onDeleted = (chatId: unknown) => {
    if (typeof chatId !== "string") return;
    reaper.onChatDeleted(chatId).catch((error) => console.warn("[Story Orchestrator] mirror reap failed", error));
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
