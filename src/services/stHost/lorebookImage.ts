const sortedKeys = (_key: string, inner: unknown): unknown =>
  (inner && typeof inner === "object" && !Array.isArray(inner) ? Object.fromEntries(Object.entries(inner).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) : inner);

export const canonicalJson = (value: unknown): string => JSON.stringify(value, sortedKeys) ?? "";

export const entriesImage = (book: unknown): string => canonicalJson((book as { entries?: unknown } | null | undefined)?.entries ?? {});

const fnv = (text: string, seed: number): string => {
  let hash = seed;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
};

export const lorebookRevision = (image: string): string => `${image.length.toString(16)}-${fnv(image, 0x811c9dc5)}${fnv(image, 0x9747b28c)}`;
