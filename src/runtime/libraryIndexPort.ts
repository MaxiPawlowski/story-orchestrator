import { log } from "@utils/log";
import { withoutReported, type LibraryIndexDelta, type LibraryLost } from "./libraryIndexCore";
import type { WriteResult } from "@utils/writeResult";

let lost: LibraryLost | null = null;
let queue: Promise<unknown> = Promise.resolve();

const later = <T>(work: (unit: typeof import("./libraryIndexUnit")) => Promise<T>): Promise<T | null> => {
  const next = queue.then(() => import("./libraryIndexUnit")).then(work).catch((error: unknown) => {
    log.warn("library index not updated", error);
    return null;
  });
  queue = next;
  return next;
};

export const noteLibraryIndex = (delta: LibraryIndexDelta): void => void later((unit) => unit.applyDelta(delta));

export const checkLibraryIndex = (notify: () => void): Promise<void> => later((unit) => unit.checkIndex()).then((found) => {
  lost = found;
  notify();
});

export const acknowledgeLibraryLost = (reported: LibraryLost, notify: () => void): Promise<WriteResult<object>> =>
  later((unit) => unit.acknowledge(reported)).then((written) => {
    if (!written) return { ok: false as const, reason: LIBRARY_ACK_FAILED };
    lost = withoutReported(lost, reported);
    notify();
    return { ok: true as const };
  });

export const LIBRARY_ACK_FAILED = "The notice could not be cleared because SillyTavern's user files did not save. Try again.";

export const libraryLost = (): LibraryLost | null => lost;
