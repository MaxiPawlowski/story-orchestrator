import { parseStoryOrThrow, type EngineState, type NormalizedStory } from "../../../src/engine/index";
import { loadGameLayer } from "../../../src/engine/validate/gameLayer";
import { sagaOutcomeLines } from "../../../src/engine/carry";
import { isIncomplete } from "../../../src/extraction/modelRoute";
import { stripChannelNoise } from "../../../src/extraction/parse";
import { buildSagaPrompt, properNouns, verifySaga } from "../../../src/memory/chapterRecord";
import { withoutSecrets, type HeldSecret } from "../../../src/memory/heldSecrets";
import type { ArcEntry, ChapterRecord, DerivedRecord } from "../../../src/memory/index";
import type { PlayerPromise } from "../../../src/memory/promises/types";
import type { GameView } from "../../../src/runtime/gameTypes";
import type { NarrativeStatus } from "../../../src/runtime/narrative";
import type { PublicPattern } from "../../../src/runtime/patternsPort";
import { playedProjection, withheldNames, type PlayedProjection } from "../../../src/runtime/playerProjection";
import { nameForRosterId, rosterMemberName } from "../../../src/runtime/roster";
import { playerTurnsInCheckpoint } from "../../../src/runtime/stretchTurns";
import {
  anchorCandidates, groundedIn, makeScreen, RESURFACE_BOUNDARIES, rankAnchors, selectAnchors, type Screen, type SuggestionAnchor,
} from "../../../src/runtime/suggestionAnchors";
import { buildSuggestionPrompt, parseSuggestionLines, suggestionsUsable, unseenWithheld, type SuggestionLine } from "../../../src/runtime/suggestions";

export interface SerialSecret { entryId?: string; phrasings: string[][]; knowers: string[]; onlyFrom: string[] | null }

export interface SuggestContext {
  story: unknown;
  state: EngineState;
  narrative: NarrativeStatus;
  arcs: ArcEntry[];
  derived?: DerivedRecord[];
  promises: PlayerPromise[];
  patterns: PublicPattern[];
  game: GameView | null;
  enabled: string[];
  chat: unknown[];
  playerName: string;
  chatId: string;
  boundaryLog: Array<{ boundary: number; before: { blackboard: { values: Record<string, unknown> } } }>;
  secrets: SerialSecret[];
  anchorsOff: boolean;
}

const secretsOf = (rows: readonly SerialSecret[]): HeldSecret[] => rows.map((row) => ({
  ...(row.entryId ? { entryId: row.entryId } : {}),
  phrasings: row.phrasings.map((words) => new Set(words)),
  knowers: new Set(row.knowers),
  onlyFrom: row.onlyFrom ? new Set(row.onlyFrom) : null,
}));

async function storyOf(raw: unknown): Promise<NormalizedStory> {
  await loadGameLayer();
  return parseStoryOrThrow(raw);
}

interface SuggestPlan {
  story: NormalizedStory;
  projection: PlayedProjection;
  anchors: SuggestionAnchor[];
  screen: Screen;
  withheld: string[];
  prompt: string;
}

async function planOf(context: SuggestContext): Promise<SuggestPlan> {
  const story = await storyOf(context.story);
  const { state } = context;
  const secrets = secretsOf(context.secrets);
  const resting = (text: string) => withoutSecrets(text, secrets, null);
  const sections = context.narrative.sections.map((section) => ({ ...section, lines: section.lines.map(resting).filter((line) => line.trim()) }));
  const projection = playedProjection({
    story, narrative: { ...context.narrative, sections }, visitedPath: state.visitedPath ?? [], activeCheckpointId: state.activeCheckpointId ?? null,
    cast: context.enabled.map((id) => nameForRosterId(story, id)), chat: context.chat, playerName: context.playerName,
    playerTurns: playerTurnsInCheckpoint(state, context.chat),
  });
  const withheld = withheldNames(story, state.visitedPath ?? [], state.activeCheckpointId ?? null, state.blackboard?.values);
  const screen = makeScreen({ story, values: state.blackboard?.values ?? {}, enabled: context.enabled, resting, unseen: unseenWithheld(projection, withheld) });
  const valuesThen = context.boundaryLog.find((entry) => entry.boundary > state.boundary - RESURFACE_BOUNDARIES)?.before.blackboard.values ?? null;
  const candidates = anchorCandidates({
    story, state, projection, arcs: context.arcs ?? [], derived: context.derived, promises: context.promises ?? [], patterns: context.patterns ?? [], game: context.game ?? null, valuesThen,
  }, screen);
  const anchors = context.anchorsOff ? [] : selectAnchors(rankAnchors(candidates, { chatId: context.chatId, storyId: story.id ?? story.title, boundary: state.boundary, again: 0 }));
  return { story, projection, anchors, screen, withheld, prompt: buildSuggestionPrompt(projection, anchors) };
}

export async function suggestionPrompt(context: SuggestContext) {
  const plan = await planOf(context);
  return { prompt: plan.prompt, anchors: plan.anchors.map(({ id, kind, text }) => ({ id, kind, text })) };
}

const withAuthoredOffers = (lines: SuggestionLine[], anchors: readonly SuggestionAnchor[]): SuggestionLine[] => {
  const dropped = anchors.filter((entry) => entry.kind === "offer" && !lines.some((line) => line.anchorId === entry.id)
    && !lines.some((line) => line.text.toLowerCase() === entry.text.toLowerCase()));
  return [...lines, ...dropped.map((entry): SuggestionLine => ({ text: entry.text, anchorId: entry.id, authored: true }))];
};

export interface ShownLine { text: string; anchor: string | null; anchorKind: string | null; authored: boolean }

export async function suggestionLines(context: SuggestContext, raw: string, finish: "stop" | "length" | "unknown") {
  const plan = await planOf(context);
  const incomplete = isIncomplete({ text: raw, finish } as Parameters<typeof isIncomplete>[0]);
  const text = incomplete ? "" : raw;
  const parsed = parseSuggestionLines(text, plan.projection, plan.withheld, { anchors: plan.anchors, grounded: groundedIn, screen: plan.screen });
  const usable = suggestionsUsable(parsed);
  const anchorOf = (id: string | undefined) => plan.anchors.find((entry) => entry.id === id) ?? null;
  const shown: ShownLine[] = usable
    ? withAuthoredOffers(parsed, plan.anchors).filter((line) => !line.authored || plan.screen(line.text)).map((line) => ({
      text: line.text, anchor: anchorOf(line.anchorId)?.text ?? null, anchorKind: anchorOf(line.anchorId)?.kind ?? null, authored: line.authored === true,
    }))
    : [];
  return { parsed: parsed.length, usable, incomplete, shown, anchors: plan.anchors.map(({ id, kind, text: anchorText }) => ({ id, kind, text: anchorText })) };
}

export const needleHits = (texts: readonly string[], needles: readonly string[]): string[] =>
  needles.filter((needle) => texts.some((line) => line.toLowerCase().includes(needle.toLowerCase())));

export interface SagaContext { story: unknown; records: ChapterRecord[]; cast: string[]; blackboardAt: Record<string, unknown> }

export async function sagaPrompt(context: SagaContext) {
  const story = await storyOf(context.story);
  return { prompt: buildSagaPrompt(story.title, context.records, sagaOutcomeLines(story, context.blackboardAt).filter(Boolean)), title: story.title };
}

export async function sagaCast(raw: unknown, playerName: string): Promise<string[]> {
  const story = await storyOf(raw);
  return [...story.roster.map(rosterMemberName), playerName, story.title];
}

export function sagaVerdict(text: string, finish: "stop" | "length" | "unknown", context: Pick<SagaContext, "records" | "cast">) {
  const incomplete = isIncomplete({ text, finish } as Parameters<typeof isIncomplete>[0]);
  const reply = incomplete ? "" : stripChannelNoise(text);
  const reasons = reply ? verifySaga(reply, context.records, context.cast) : [incomplete ? (finish === "length" ? "cut at the token limit (refuseIncomplete)" : "degenerate reply (refuseIncomplete)") : "empty reply"];
  const known = [...context.records.flatMap((record) => [record.summary, record.playerTitle, ...record.consequences.map((item) => item.text), ...record.people.map((person) => person.name)]), ...context.cast].join("\n").toLowerCase();
  const nouns = reply ? properNouns(reply) : [];
  return {
    accepted: Boolean(reply) && !reasons.length,
    incomplete,
    reasons,
    words: reply ? reply.trim().split(/\s+/).length : 0,
    invented: nouns.filter((name) => !known.includes(name.toLowerCase())),
    properNouns: nouns,
    reply,
  };
}
