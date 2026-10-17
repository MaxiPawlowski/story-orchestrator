
import { fnv1a } from "@runtime/hash";

const sortedKeys = (_key: string, inner: unknown): unknown =>
  (inner && typeof inner === "object" && !Array.isArray(inner) ? Object.fromEntries(Object.entries(inner).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) : inner);

const canonicalJson = (value: unknown): string => JSON.stringify(value, sortedKeys) ?? "";

export const entriesImage = (book: unknown): string => canonicalJson((book as { entries?: unknown } | null | undefined)?.entries ?? {});

export const lorebookRevision = (image: string): string => `${image.length.toString(16)}-${fnv1a(image)}${fnv1a([...image].reverse().join(""))}`;
