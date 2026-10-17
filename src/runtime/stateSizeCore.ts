const MIB = 1024 * 1024;

export const STATE_SIZE_LIMITS = { blobChars: 8 * MIB, libraryChars: 5 * MIB } as const;

export interface StateSize {
  blobChars: number;
  libraryChars: number;
}

const itemChars = new WeakMap<object, number>();

const charsOf = (item: unknown): number => {
  if (item === null || typeof item !== "object") return JSON.stringify(item ?? null).length;
  const known = itemChars.get(item);
  if (known !== undefined) return known;
  const chars = JSON.stringify(item).length;
  itemChars.set(item, chars);
  return chars;
};

export const sizeOfItems = (items: readonly unknown[]): number => items.reduce<number>((sum, item) => sum + charsOf(item), 0);

export const listed = (value: unknown): unknown[] => (Array.isArray(value) ? value : value && typeof value === "object" ? Object.values(value) : []);

export const overLimit = (size: StateSize | null | undefined): Array<"blob" | "library"> => [
  ...(size && size.blobChars > STATE_SIZE_LIMITS.blobChars ? ["blob" as const] : []),
  ...(size && size.libraryChars > STATE_SIZE_LIMITS.libraryChars ? ["library" as const] : []),
];
