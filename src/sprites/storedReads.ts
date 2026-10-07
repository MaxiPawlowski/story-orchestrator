import { fnv1a } from "@runtime/hash";
import { isRecord } from "@utils/guards";

export interface StoredRead {
  i: number;
  who: string;
  face: string;
  src: string;
  at: string;
}

export interface StoredReadRecord {
  hash: string;
  swipe: number;
  reads: StoredRead[];
}

export interface ReadOwner {
  text: string;
  swipeId: number;
}

export const storedReadRecord = (reads: StoredRead[], owner: ReadOwner): StoredReadRecord => ({ hash: fnv1a(owner.text), swipe: owner.swipeId, reads });

export function storedReads(value: unknown, owner: ReadOwner): StoredRead[] {
  if (!isRecord(value) || !Array.isArray(value.reads) || value.hash !== fnv1a(owner.text) || value.swipe !== owner.swipeId) return [];
  return value.reads.filter((entry): entry is StoredRead => isRecord(entry) && typeof entry.who === "string" && typeof entry.face === "string")
    .map((entry) => ({ ...entry, at: typeof entry.at === "string" ? entry.at : "" }));
}
