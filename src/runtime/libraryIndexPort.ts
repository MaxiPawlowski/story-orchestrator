import { log } from "@utils/log";
import type { LibraryIndexDelta, LibraryLost } from "./libraryIndexCore";

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

export const libraryLost = (): LibraryLost | null => lost;
