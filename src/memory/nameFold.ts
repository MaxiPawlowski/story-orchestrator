export interface NameSource {
  roster: ReadonlyArray<{ id: string; name?: string; aliases?: readonly string[] }>;
  codex?: {
    people?: ReadonlyArray<{ member?: string; name?: string; aliases?: readonly string[] }>;
    places?: ReadonlyArray<{ name?: string; location?: string; aliases?: readonly string[] }>;
  };
  requirements?: { place_lore?: Readonly<Record<string, { entry: string }>> };
  scene_read?: { locations?: readonly string[] };
  factions?: ReadonlyArray<{ name: string }>;
}

export interface NameMember {
  id: string;
  name: string;
  folds: string[];
  tokens: string[];
}

export interface NameIndex {
  members: NameMember[];
  entities?: NameMember[];
}

export const SAME_CHARACTER_MIN_READS = 3;

const ARTICLE = /^(the|a|an)\s+/;

export const foldName = (name: string): string => name.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase()
  .replace(/[^\p{L}\p{N}\s'-]/gu, " ").replace(/\s+/g, " ").trim().replace(ARTICLE, "").trim();

export const nameIndexOf = (source: NameSource | null | undefined, entities?: boolean): NameIndex => buildNameIndex(source ?? { roster: [] }, entities === true);

const named = (name: string, aliases: readonly string[]): NameMember | null => {
  const canonical = name.trim();
  const folds = [...new Set([canonical, ...aliases].map(foldName).filter(Boolean))];
  return canonical && folds.length ? { id: canonical, name: canonical, folds, tokens: foldName(canonical).split(" ").filter(Boolean) } : null;
};

export const entityNames = (source: NameSource): NameMember[] => {
  const lore = source.requirements?.place_lore ?? {};
  const places = (source.codex?.places ?? []).map((entry) => {
    const name = entry.name?.trim() || entry.location?.trim() || "";
    const bound = entry.location ? lore[entry.location]?.entry ?? "" : "";
    return named(name, [entry.location ?? "", bound, ...(entry.aliases ?? [])]);
  });
  const people = (source.codex?.people ?? []).filter((entry) => !entry.member).map((entry) => named(entry.name ?? "", entry.aliases ?? []));
  const covered = new Set(places.flatMap((entry) => entry?.folds ?? []));
  const pinned = Object.entries(lore).filter(([place]) => !covered.has(foldName(place))).map(([place, binding]) => named(place, [binding.entry]));
  const listed = [...(source.scene_read?.locations ?? []), ...(source.factions ?? []).map((faction) => faction.name)].map((name) => named(name, []));
  const all = [...places, ...people, ...pinned, ...listed].filter((entry): entry is NameMember => entry !== null);
  return all.filter((entry, at) => all.findIndex((other) => other.name === entry.name) === at);
};

export const buildNameIndex = (source: NameSource, entities = false): NameIndex => ({
  members: source.roster.map((member) => {
    const name = member.name?.trim() || member.id;
    const codex = (source.codex?.people ?? []).filter((entry) => entry.member === member.id).flatMap((entry) => [entry.name ?? "", ...(entry.aliases ?? [])]);
    const folds = [...new Set([name, member.id, ...(member.aliases ?? []), ...codex].map(foldName).filter(Boolean))];
    return { id: member.id, name, folds, tokens: foldName(name).split(" ").filter(Boolean) };
  }),
  ...(entities ? { entities: entityNames(source) } : {}),
});

const only = <T,>(items: T[]): T | null => (items.length === 1 ? items[0] : null);

const structural = (member: NameMember, tokens: string[]): boolean => {
  if (tokens.length > member.tokens.length) return false;
  if (tokens.every((token, at) => member.tokens[at] === token)) return true;
  return tokens.length === 1 && member.tokens.length > 1 && member.tokens.at(-1) === tokens[0];
};

export const resolveName = (index: NameIndex, raw: string): NameMember | null => {
  const folded = foldName(raw);
  if (!folded) return null;
  const exact = index.members.filter((member) => member.folds.includes(folded));
  if (exact.length) return only(exact);
  const tokens = folded.split(" ");
  return only(index.members.filter((member) => structural(member, tokens)));
};

export const canonicalName = (index: NameIndex, raw: string): string => resolveName(index, raw)?.name ?? raw;

export const canonicalEntity = (index: NameIndex, raw: string): string => {
  const folded = foldName(raw);
  return (folded && only((index.entities ?? []).filter((entity) => entity.folds.includes(folded)))?.name) || raw;
};

const CHARACTER_TYPES = new Set(["character", "person", ""]);

const eitherName = (index: NameIndex, raw: string): string => resolveName(index, raw)?.name ?? canonicalEntity(index, raw);

export const foldLedgerSignals = <T extends { entity: string; entityType: string; object?: string }>(index: NameIndex, signals: readonly T[]): T[] =>
  signals.map((signal) => (signal.object !== undefined ? { ...signal, entity: eitherName(index, signal.entity), object: eitherName(index, signal.object) }
    : CHARACTER_TYPES.has(signal.entityType.trim().toLowerCase()) ? { ...signal, entity: canonicalName(index, signal.entity) }
    : index.entities?.length ? { ...signal, entity: canonicalEntity(index, signal.entity) } : signal));

export const foldEpistemicSignals = <T extends { subject: string; hiddenFrom?: string }>(index: NameIndex, signals: readonly T[]): T[] =>
  signals.map((signal) => ({ ...signal, subject: canonicalName(index, signal.subject), ...(signal.hiddenFrom ? { hiddenFrom: canonicalName(index, signal.hiddenFrom) } : {}) }));

export const memorySightings = (memory: {
  epistemic?: ReadonlyArray<{ subject: string; hiddenFrom?: string; createdAt: number; provenance?: { boundary: number } }>;
  ledger?: ReadonlyArray<{ entity: string; entityType: string; provenance?: { boundary: number } }>;
}): NameSighting[] => [
  ...(memory.epistemic ?? []).flatMap((entry) => [entry.subject, ...(entry.hiddenFrom ? [entry.hiddenFrom] : [])]
    .map((name) => ({ name, read: String(entry.provenance?.boundary ?? entry.createdAt) }))),
  ...(memory.ledger ?? []).filter((entry) => CHARACTER_TYPES.has(entry.entityType.trim().toLowerCase())).map((entry) => ({ name: entry.entity, read: String(entry.provenance?.boundary ?? -1) })),
];

export interface NameSighting {
  name: string;
  read: string;
}

export const sameCharacterCandidates = (index: NameIndex, sightings: readonly NameSighting[], ignore: readonly string[] = []): string[] => {
  const skipped = new Set(ignore.map(foldName).filter(Boolean));
  const reads = new Map<string, { name: string; reads: Set<string> }>();
  sightings.forEach(({ name, read }) => {
    const folded = foldName(name);
    if (!folded || skipped.has(folded) || resolveName(index, name)) return;
    const seen = reads.get(folded) ?? { name: name.trim(), reads: new Set<string>() };
    seen.reads.add(read);
    reads.set(folded, seen);
  });
  return [...reads.values()].filter((seen) => seen.reads.size >= SAME_CHARACTER_MIN_READS).map((seen) => seen.name);
};
