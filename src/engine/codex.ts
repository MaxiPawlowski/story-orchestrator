import { evaluateGate, gateKeys } from "./gates";
import { castMemberName } from "./castNames";
import {
  CODEX_PAGES, CODEX_START, PARTY_LOCATION_KEY, codexEntryKey, codexFactKey, isReached,
  type CodexEntry, type CodexFact, type CodexKnownWhen, type CodexPage, type PrimitiveValue, type RosterMember, type StoryCodex,
} from "./schema";

type Values = Readonly<Record<string, unknown>>;

export interface CodexStory {
  codex?: StoryCodex;
  roster: RosterMember[];
}

export interface CodexItem {
  page: CodexPage;
  entry: CodexEntry;
}

export interface CodexPath {
  visitedPath: readonly string[];
  activeCheckpointId: string;
}

export interface CodexLatchView extends CodexPath {
  boundary: number;
  values: Values;
}

export interface KnownEntities {
  entries: ReadonlySet<string>;
  members: ReadonlySet<string>;
}

export interface CodexScopeUnits {
  entries: string[][];
  facts: string[][];
}

const reader = (values: Values) => ({ get: (key: string) => values[key] as PrimitiveValue | undefined });

export const codexItems = (story: Pick<CodexStory, "codex">): CodexItem[] =>
  CODEX_PAGES.flatMap((page) => (story.codex?.[page] ?? []).map((entry) => ({ page, entry })));

export const entityRef = (page: CodexPage, id: string): string => `${page}:${id}`;

export const entryCondition = (entry: CodexEntry): CodexKnownWhen | undefined =>
  entry.known_when ?? (entry.location ? { q: PARTY_LOCATION_KEY, op: "==", v: entry.location } : undefined);

export const knownWhenHolds = (when: CodexKnownWhen, values: Values, path: CodexPath): boolean => {
  if (when === CODEX_START) return true;
  if (isReached(when)) return path.activeCheckpointId === when.reached || path.visitedPath.includes(when.reached);
  return evaluateGate(when, reader(values));
};

export const knownWhenKeys = (when: CodexKnownWhen | undefined): string[] => (!when || when === CODEX_START || isReached(when) ? [] : gateKeys(when));

export const factKnown = (page: CodexPage, entry: CodexEntry, fact: CodexFact, values: Values): boolean =>
  fact.known_when === CODEX_START || values[codexFactKey(page, entry.id, fact.id)] !== undefined;

export const entryLatched = (page: CodexPage, entry: CodexEntry, values: Values): boolean =>
  entry.known_when === CODEX_START || values[codexEntryKey(page, entry.id)] !== undefined;

export const entryKnown = (page: CodexPage, entry: CodexEntry, values: Values): boolean =>
  entryLatched(page, entry, values) || entry.facts.some((fact) => factKnown(page, entry, fact, values));

export const latchedAt = (key: string, values: Values): number | null => {
  const value = values[key];
  return typeof value === "number" ? value : null;
};

const due = (key: string, when: CodexKnownWhen | undefined, view: CodexLatchView): Array<{ q: string; v: number }> =>
  (when && when !== CODEX_START && view.values[key] === undefined && knownWhenHolds(when, view.values, view) ? [{ q: key, v: view.boundary }] : []);

export const codexLatches = (story: Pick<CodexStory, "codex">, view: CodexLatchView): Array<{ q: string; v: number }> =>
  codexItems(story).flatMap(({ page, entry }) => [
    ...due(codexEntryKey(page, entry.id), entryCondition(entry), view),
    ...entry.facts.flatMap((fact) => due(codexFactKey(page, entry.id, fact.id), fact.known_when, view)),
  ]);

export const knownEntities = (story: CodexStory, values: Values, enabled: readonly string[] = []): KnownEntities => {
  const items = codexItems(story);
  const entries = new Set(items.filter(({ page, entry }) => entryKnown(page, entry, values)).map(({ page, entry }) => entityRef(page, entry.id)));
  const ownEntry = new Map(items.filter(({ page, entry }) => page === "people" && entry.member).map(({ page, entry }) => [entry.member as string, entityRef(page, entry.id)]));
  const live = new Set(enabled);
  const members = new Set(story.roster.filter((member) => {
    const ref = ownEntry.get(member.id);
    return ref ? entries.has(ref) : live.has(member.id);
  }).map((member) => member.id));
  return { entries, members };
};

export const unknownEntityNames = (story: CodexStory, known: KnownEntities): string[] => {
  const entries = codexItems(story).filter(({ page, entry }) => !known.entries.has(entityRef(page, entry.id)))
    .flatMap(({ entry }) => [entryName(story, entry), ...(entry.aliases ?? [])]);
  const members = story.roster.filter((member) => !known.members.has(member.id)).flatMap((member) => [member.name ?? member.id, ...(member.aliases ?? [])]);
  return [...new Set([...entries, ...members].map((name) => name.trim()).filter(Boolean))];
};

export const findEntry = (story: Pick<CodexStory, "codex">, id: string): CodexItem | null =>
  codexItems(story).find(({ entry }) => entry.id === id) ?? null;

export const sourceKnown = (story: CodexStory, source: string, known: KnownEntities): boolean => {
  const item = findEntry(story, source);
  if (item) return known.entries.has(entityRef(item.page, item.entry.id));
  return known.members.has(source);
};

export const entryName = (story: CodexStory, entry: CodexEntry, castNames: Readonly<Record<string, string>> = {}): string =>
  entry.name ?? (entry.member ? castNames[entry.member] ?? castMemberName(story.roster, entry.member) : entry.id);

export const sourceName = (story: CodexStory, source: string, castNames: Readonly<Record<string, string>> = {}): string => {
  const item = findEntry(story, source);
  return item ? entryName(story, item.entry, castNames) : castNames[source] ?? castMemberName(story.roster, source);
};

const unique = (keys: string[]): string[] => [...new Set(keys)];

export const codexScopeUnits = (story: Pick<CodexStory, "codex">, values: Values): CodexScopeUnits => {
  const entries: string[][] = [];
  const facts: string[][] = [];
  codexItems(story).forEach(({ page, entry }) => {
    const open = entry.facts.filter((fact) => !factKnown(page, entry, fact, values));
    if (!entryKnown(page, entry, values)) {
      const keys = unique([...knownWhenKeys(entryCondition(entry)), ...open.flatMap((fact) => knownWhenKeys(fact.known_when))]);
      if (keys.length) entries.push(keys);
      return;
    }
    open.forEach((fact) => {
      const keys = knownWhenKeys(fact.known_when);
      if (keys.length) facts.push(keys);
    });
  });
  return { entries, facts };
};

export const entityNames = (story: CodexStory, entry: CodexEntry, castNames: Readonly<Record<string, string>> = {}): string[] =>
  unique([entryName(story, entry, castNames), ...(entry.aliases ?? [])].map((name) => name.trim()).filter(Boolean));

export const unknownCodexNames = (story: CodexStory, values: Values): string[] =>
  unique(codexItems(story).filter(({ page, entry }) => !entryKnown(page, entry, values)).flatMap(({ entry }) => [entry.name ?? "", ...(entry.aliases ?? [])])
    .map((name) => name.trim()).filter(Boolean));
