export interface StoredRead {
  i: number;
  who: string;
  face: string;
  src: string;
  at: string;
}

export function storedReads(value: unknown): StoredRead[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is StoredRead => Boolean(entry) && typeof entry === "object"
    && typeof (entry as StoredRead).who === "string" && typeof (entry as StoredRead).face === "string")
    .map((entry) => ({ ...entry, at: typeof entry.at === "string" ? entry.at : "" }));
}
