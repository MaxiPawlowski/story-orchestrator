const FRAMING = /^(close[ _-]?up|portrait|upper[ _]body|cowboy[ _]shot|cowboy|full[ _]body|wide[ _]shot|establishing[ _]shot|pov|medium[ _]shot|bust[ _]shot)$/i;
const ANGLE = /^from[ _](below|above)$/i;
const COUNT = /^(\d+)\s*(girl|boy|other)s?$/i;
const GROUP = /^(solo|multiple[ _](girls|boys|others))$/i;

export interface TagHygiene { names: string[]; visible: number; keepAngle: boolean }
const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const countTags = (tags: string[]): Map<string, number> | null => {
  const counts = new Map<string, number>();
  for (const tag of tags) {
    const match = COUNT.exec(tag);
    if (!match) return null;
    counts.set(match[2].toLowerCase(), (counts.get(match[2].toLowerCase()) ?? 0) + Number(match[1]));
  }
  return counts;
};
const total = (counts: Map<string, number>) => [...counts.values()].reduce((sum, value) => sum + value, 0);
const asTags = (counts: Map<string, number>) => [...counts].map(([kind, n]) => (n === 1 ? `1${kind}` : `${n}${kind}s`));

export function tidyTags(prompt: string, pinned: string[], hygiene: TagHygiene): { counts: string[]; pinned: string[]; rest: string[] } {
  const names = hygiene.names.map((name) => name.trim()).filter((name) => name.length >= 2).sort((a, b) => b.length - a.length);
  const strip = (tag: string) => names.reduce((text, name) => (text.toLowerCase() === name.toLowerCase() ? "" : text.replace(new RegExp(`(^|[^\\w])${escape(name)}(?=$|[^\\w])`, "gi"), "$1")), tag)
    .replace(/\s{2,}/g, " ").replace(/^[\s'’-]+|[\s'’-]+$/g, "").trim();
  const tags = prompt.split(",").map((tag) => strip(tag.trim())).filter(Boolean);
  const isCount = (tag: string) => COUNT.test(tag) || GROUP.test(tag);
  const pinnedCounts = pinned.filter((tag) => COUNT.test(tag)), pinnedRest = pinned.filter((tag) => !isCount(tag));
  const directed = tags.filter((tag) => COUNT.test(tag));
  const fromPins = countTags(pinnedCounts), fromDirector = countTags(directed);
  const counts = fromPins && hygiene.visible > 0 && total(fromPins) === hygiene.visible ? asTags(fromPins)
    : fromDirector && directed.length && (hygiene.visible <= 0 || total(fromDirector) === hygiene.visible) ? asTags(fromDirector)
      : hygiene.visible === 1 ? ["solo"] : [];
  const rest = tags.filter((tag) => !isCount(tag) && !FRAMING.test(tag) && (hygiene.keepAngle || !ANGLE.test(tag)));
  const seen = new Set(counts.map((tag) => tag.toLowerCase()));
  const unique = (list: string[]) => list.filter((tag) => !seen.has(tag.toLowerCase()) && seen.add(tag.toLowerCase()));
  return { counts, pinned: unique(pinnedRest), rest: unique(rest) };
}
