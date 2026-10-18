import {
  codexEntryKey, codexFactKey, hasCodex, isReached, type BoundaryLogEntry, type CodexEntry, type CodexFact, type CodexPage, type EngineState, type NormalizedStory,
} from "@engine/index";
import { entryKnown, entryName, factKnown, knownEntities, latchedAt, returnShownAt, sourceKnown, sourceName, type KnownEntities } from "@engine/codex";
import type { CodexEntryView, CodexFactView, CodexRowView, CodexView, LogRowView } from "./gameTypes";

type Values = Readonly<Record<string, unknown>>;

export interface CodexSources {
  story: NormalizedStory;
  state: EngineState;
  castNames: Record<string, string>;
  enabled?: readonly string[];
  personRows?: (member: string, known: KnownEntities) => CodexRowView[];
  extraPeople?: (known: KnownEntities, paged: ReadonlySet<string>) => CodexEntryView[];
}

export const codexShown = (story: NormalizedStory): boolean => hasCodex(story.codex) && story.display?.codex !== false;

const freshAt = (at: number | null, boundary: number): boolean => at !== null && boundary > 0 && at === boundary;

const provenance = (story: NormalizedStory, fact: CodexFact, known: KnownEntities, castNames: Record<string, string>): string | undefined => {
  if (fact.source && sourceKnown(story, fact.source, known)) return `From ${sourceName(story, fact.source, castNames)}`;
  if (!isReached(fact.known_when)) return undefined;
  const place = story.checkpointById[fact.known_when.reached]?.player_name?.trim();
  return place ? `At ${place}` : undefined;
};

const returnRows = (place: CodexEntry, values: Values, boundary: number): CodexRowView[] => (place.returns ?? []).flatMap((back) => {
  const at = returnShownAt(place, back, values);
  return at === null ? [] : [{ text: back.text, kind: "return" as const, ...(freshAt(at, boundary) ? { fresh: true } : {}) }];
});

const entryView = (sources: CodexSources, page: CodexPage, entry: CodexEntry, known: KnownEntities): CodexEntryView[] => {
  const { story, state, castNames } = sources;
  const values: Values = state.blackboard.values;
  if (!entryKnown(page, entry, values)) return [];
  const shown = entry.facts.filter((fact) => factKnown(page, entry, fact, values));
  const facts = shown.map((fact): CodexFactView => {
    const from = provenance(story, fact, known, castNames);
    return { text: fact.text, fresh: freshAt(latchedAt(codexFactKey(page, entry.id, fact.id), values), state.boundary), ...(from ? { from } : {}) };
  });
  const firsts = [latchedAt(codexEntryKey(page, entry.id), values), ...shown.map((fact) => latchedAt(codexFactKey(page, entry.id, fact.id), values))];
  const startKnown = entry.known_when === "start" || shown.some((fact) => fact.known_when === "start");
  const learned = firsts.filter((at): at is number => at !== null);
  const rows = page === "people" && entry.member ? sources.personRows?.(entry.member, known) ?? [] : returnRows(entry, values, state.boundary);
  return [{
    name: entryName(story, entry, castNames), fresh: !startKnown && learned.length > 0 && freshAt(Math.min(...learned), state.boundary), facts,
    ...(rows.length ? { rows } : {}),
  }];
};

export const composeCodex = (sources: CodexSources): CodexView | undefined => {
  const { story, state } = sources;
  const shown = codexShown(story);
  if (!shown && !sources.extraPeople) return undefined;
  const known = knownEntities(story, state.blackboard.values, sources.enabled);
  const page = (name: CodexPage) => (shown ? story.codex?.[name] ?? [] : []).flatMap((entry) => entryView(sources, name, entry, known));
  const paged = new Set((shown ? story.codex?.people ?? [] : []).flatMap((entry) => (entry.member ? [entry.member] : [])));
  const view = { people: [...page("people"), ...(sources.extraPeople?.(known, paged) ?? [])], places: page("places") };
  return view.people.length || view.places.length ? view : undefined;
};

const learnedOn = (story: NormalizedStory, entry: BoundaryLogEntry, castNames: Record<string, string>): LogRowView[] => {
  const before: Values = entry.before.blackboard.values;
  const after: Values = entry.after.blackboard.values;
  const at = { boundary: entry.boundary, messageId: entry.context.lastMessageId };
  return (["people", "places"] as const).flatMap((page) => (story.codex?.[page] ?? []).flatMap((item): LogRowView[] => {
    if (!entryKnown(page, item, after)) return [];
    const gained = !entryKnown(page, item, before) || item.facts.some((fact) => factKnown(page, item, fact, after) && !factKnown(page, item, fact, before));
    return gained ? [{ at, kind: "learned", text: `Learned about ${entryName(story, item, castNames)}` }] : [];
  }));
};

export const codexLogRows = (story: NormalizedStory, log: readonly BoundaryLogEntry[], castNames: Record<string, string>): LogRowView[] =>
  (codexShown(story) ? log.flatMap((entry) => learnedOn(story, entry, castNames)) : []);
