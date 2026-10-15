import { listAllLorebooks, subscribeToHostEvents } from "@services/STAPI";
import { lifetimeOwnership, orphanRegistry } from "./mirrorReaper";
import { log } from "@utils/log";

// The reaper's host wiring; the reapers themselves load with the first deleted chat
// (`mirrorReaperUnit.ts`). ST's `emit` awaits every listener in turn (lib/eventemitter.js:146), so the
// handler must not hold the event on the confirm.
export function startMirrorReaper(notify: () => void): () => void {
  const lifetime = lifetimeOwnership();
  orphanRegistry.watch((name) => listAllLorebooks().includes(name));
  let units: ReturnType<typeof loadUnits> | null = null;
  const loadUnits = () => import("./mirrorReaperUnit").then(({ buildReapers }) => buildReapers(notify, lifetime));
  let queue: Promise<unknown> = Promise.resolve();
  const onDeleted = (chatId: unknown) => {
    if (typeof chatId !== "string") return;
    const ready = (units ??= loadUnits());
    queue = queue
      .then(() => ready)
      .then(({ reaper }) => reaper.onChatDeleted(chatId).catch((error: unknown) => log.warn("mirror reap failed", error)))
      .then(() => ready)
      .then(({ created }) => created.onChatDeleted(chatId).catch((error: unknown) => log.warn("created-entry reap failed", error)))
      .catch((error: unknown) => log.warn("chat-delete reapers did not load", error));
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
