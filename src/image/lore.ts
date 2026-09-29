export interface ImageLoreEntry { world: string; comment?: string; key?: unknown; content: string; disable?: boolean }

const match = (text: string, name: string): boolean => {
  if (name.trim().length < 3) return false;
  const escape = name.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^\\p{L}\\p{N}])${escape}($|[^\\p{L}\\p{N}])`, "iu").test(text);
};

export function visualLore(entries: ImageLoreEntry[], books: string[], enabledGates: Array<{ lorebook: string; enable: string[] }>, scene: string): string[] {
  const scoped = new Set(books.map((book) => book.trim().toLowerCase()));
  const enabled = new Set(enabledGates.flatMap((book) => book.enable.map((comment) => `${book.lorebook.trim().toLowerCase()}:${comment.toLowerCase()}`)));
  const found = new Set<string>();
  const lines: string[] = [];
  for (const entry of entries) {
    const book = entry.world.trim().toLowerCase();
    if (!scoped.has(book)) continue;
    if (entry.disable && !enabled.has(`${book}:${entry.comment?.toLowerCase() ?? ""}`)) continue;
    const appearance = entry.content.split(/\r?\n/).find((line) => /^\s*Appearance\s*:/i.test(line))?.replace(/^\s*Appearance\s*:\s*/i, "").trim();
    if (!appearance) continue;
    const keys = Array.isArray(entry.key) ? entry.key.filter((key): key is string => typeof key === "string") : [];
    const name = keys.find((key) => match(scene, key)) ?? (entry.comment && match(scene, entry.comment) ? entry.comment : null);
    if (!name || found.has(name.toLowerCase())) continue;
    found.add(name.toLowerCase());
    lines.push(`${name}: ${appearance.slice(0, 360)}`);
    if (lines.length >= 8) break;
  }
  return lines;
}
