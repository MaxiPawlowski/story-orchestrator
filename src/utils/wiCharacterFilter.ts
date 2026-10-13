export interface LoreMember {
  filename: string | null;
  tags: string[] | null;
}

const strings = (value: unknown): string[] => Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];

export function eligibleLoreMember(filter: unknown, member: LoreMember): boolean {
  if (!filter || typeof filter !== "object") return true;
  const fields = filter as { names?: unknown; tags?: unknown; isExclude?: unknown };
  const names = strings(fields.names);
  const tags = strings(fields.tags);
  const exclude = Boolean(fields.isExclude);
  if (names.length && (exclude ? names.includes(member.filename ?? "") : !names.includes(member.filename ?? ""))) return false;
  if (tags.length && member.tags !== null) {
    const matches = member.tags.some((tag) => tags.includes(tag));
    if (exclude ? matches : !matches) return false;
  }
  return true;
}
