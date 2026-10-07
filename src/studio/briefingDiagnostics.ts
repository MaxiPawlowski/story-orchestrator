import { castCardName, resolveCastChanges, type Checkpoint, type StoryBriefing, type StoryV2 } from "@engine/index";

type BriefingCode = "briefing-spoiler-risk";

export const BRIEFING_CONSEQUENCES: Record<BriefingCode, string> = {
  "briefing-spoiler-risk": "The player reads this before it happens, so it may give away a scene, an outcome or a character still ahead.",
};

export interface BriefingRun {
  draft: StoryV2;
  push: (code: BriefingCode, severity: "warning", path: string, message: string) => void;
  startId: string;
}

const MIN_TERM = 4;
const ID_SHAPE = /[-_0-9]/;

const fold = (text: string) => text.trim().toLowerCase();

const escapeRegex = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const MAX_PATTERNS = 4096;
const patterns = new Map<string, RegExp | null>();

const patternFor = (term: string): RegExp | null => {
  const needle = fold(term);
  const cached = patterns.get(needle);
  if (cached !== undefined) return cached;
  const pattern = needle.length < MIN_TERM && !ID_SHAPE.test(needle)
    ? null
    : new RegExp(`(?<![\\p{L}\\p{N}_])${escapeRegex(needle)}(?![\\p{L}\\p{N}_])`, "u");
  if (patterns.size >= MAX_PATTERNS) patterns.clear();
  patterns.set(needle, pattern);
  return pattern;
};

const namesFolded = (folded: string, term: string): boolean => patternFor(term)?.test(folded) ?? false;

const names = (text: string, term: string): boolean => namesFolded(fold(text), term);

export interface Terms {
  checkpoints: string[];
  values: string[];
  muted: string[];
}

const checkpointTerms = (checkpoints: readonly Checkpoint[]): string[] => checkpoints.flatMap((checkpoint) => [
  ...(ID_SHAPE.test(checkpoint.id) ? [checkpoint.id] : []),
  checkpoint.name,
  ...(checkpoint.player_name ? [checkpoint.player_name] : []),
]);

const qualityValues = (draft: StoryV2, start: Checkpoint | undefined): string[] => {
  const known = new Set(Object.values(start?.state_snapshot ?? {}).filter((value): value is string => typeof value === "string").map(fold));
  return draft.qualities.flatMap((quality) => (quality.type === "enum" ? quality.values ?? [] : []))
    .filter((value) => value.trim().length >= MIN_TERM && !known.has(fold(value)));
};

const mutedAtStart = (draft: StoryV2, start: Checkpoint | undefined): string[] => {
  const disabled = resolveCastChanges(draft.roster, start?.effects?.cast_changes)?.changes.disable ?? [];
  return disabled.flatMap((name) => {
    const member = draft.roster.find((entry) => fold(castCardName(entry)) === fold(name) || fold(entry.id) === fold(name));
    return member ? [castCardName(member), member.id, ...(member.aliases ?? [])] : [name];
  });
};

const entryCheckpoints = (draft: StoryV2, chapterId: string, startId: string): Set<string> => {
  const chapterOf = new Map(draft.checkpoints.map((checkpoint) => [checkpoint.id, checkpoint.chapter]));
  const entries = draft.transitions.filter((transition) => chapterOf.get(transition.to) === chapterId && chapterOf.get(transition.from) !== chapterId).map((transition) => transition.to);
  return new Set([...entries, ...(chapterOf.get(startId) === chapterId ? [startId] : [])]);
};

const storyTerms = (draft: StoryV2, startId: string): Terms => {
  const start = draft.checkpoints.find((checkpoint) => checkpoint.id === startId);
  return {
    checkpoints: checkpointTerms(draft.checkpoints.filter((checkpoint) => checkpoint.id !== startId)).filter((term) => !start || !names(start.name, term)),
    values: qualityValues(draft, start),
    muted: mutedAtStart(draft, start),
  };
};

const chapterTerms = (draft: StoryV2, index: number, startId: string): Terms => {
  const chapters = draft.chapters ?? [];
  const earlier = new Set(chapters.slice(0, index).map((chapter) => chapter.id));
  const entries = entryCheckpoints(draft, chapters[index].id, startId);
  const ahead = draft.checkpoints.filter((checkpoint) => !earlier.has(checkpoint.chapter ?? "") && !entries.has(checkpoint.id));
  return { checkpoints: checkpointTerms(ahead), values: qualityValues(draft, draft.checkpoints.find((checkpoint) => checkpoint.id === startId)), muted: [] };
};

const fields = (briefing: StoryBriefing, path: string): Array<[string, string]> => [
  ...(briefing.title ? [[`${path}.title`, briefing.title] as [string, string]] : []),
  ...(briefing.tone ? [[`${path}.tone`, briefing.tone] as [string, string]] : []),
  ...briefing.sections.flatMap((section, index): Array<[string, string]> => [
    [`${path}.sections.${index}.heading`, section.heading],
    [`${path}.sections.${index}.text`, section.text],
  ]),
];

const unique = (terms: string[]) => {
  const seen = new Set<string>();
  return terms.filter((term) => {
    const key = fold(term);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

export const namesTerms = (text: string, terms: Terms): string[] => {
  const folded = fold(text);
  const named = (term: string) => namesFolded(folded, term);
  return [
    ...unique(terms.checkpoints).filter(named).map((term) => `a later checkpoint ('${term}')`),
    ...unique(terms.values).filter(named).map((term) => `a story value ('${term}')`),
    ...unique(terms.muted).filter(named).map((term) => `a character who is not in the scene at the start ('${term}')`),
  ];
};

export const briefingTermsFor = (draft: StoryV2, startId: string): Terms => storyTerms(draft, startId);

const checkFields = (briefing: StoryBriefing, path: string, terms: Terms, push: BriefingRun["push"]) => {
  fields(briefing, path).forEach(([at, text]) => {
    const found = namesTerms(text, terms);
    if (found.length) push("briefing-spoiler-risk", "warning", at, `this briefing text names ${found.join(", ")}; keep it to what the player may know when it shows`);
  });
};

export const checkBriefingSpoilers = ({ draft, push, startId }: BriefingRun) => {
  if (draft.briefing) checkFields(draft.briefing, "briefing", storyTerms(draft, startId), push);
  (draft.chapters ?? []).forEach((chapter, index) => {
    if (chapter.briefing) checkFields(chapter.briefing, `chapters.${index}.briefing`, chapterTerms(draft, index, startId), push);
  });
};
