import { castCardName } from "@engine/castNames";
import { nameMatcher } from "@talk/aliases";
import {
  activeEpistemic, attributedEpistemicLine, BEAT_RING_CAP, estimateTokens, joinBlocks, NARRATOR_HOLDINGS_TOKEN_BUDGET, NARRATOR_HOLDINGS_WINDOW, type CastVoice,
} from "./index";
import type { EpistemicEntry, EpistemicTag, InnerBeat, ParsedEpistemicSignal } from "./types";

export const NARRATOR_SUBJECT_CAP = 6;
export const INTENT_OPEN_CAP = 3;
export const HARVEST_CHARS = 600;
export const HARVEST_HEADER = "Each character's own private reasoning (evidence ONLY for that same character's [intends] lines; never for anyone else):";

const norm = (value: string) => value.trim().toLowerCase();

const META = new RegExp([
  "\\bi (should|will|need to|must) (write|respond|reply|continue|describe|narrate)",
  "\\bthe user\\b", "\\bthe player (wants|asked|expects)", "\\bas an ai\\b",
  "\\b(this|my|the next) (reply|response|message)\\b", "\\bin character\\b", "\\broleplay", "\\{\\{(user|char)\\}\\}",
].join("|"), "i");

export const isMetaCommentary = (text: string): boolean => META.test(text);

export interface IntentEvidence {
  characters: Array<{ speaker: string; text: string }>;
  players: string[];
}

export const intentEvidence = (messages: Array<{ speaker: string; text: string; isUser: boolean }>, players: string[]): IntentEvidence => ({
  characters: messages.filter((message) => !message.isUser).map((message) => ({ speaker: norm(message.speaker), text: message.text })),
  players: [...players, ...messages.filter((message) => message.isUser).map((message) => message.speaker)].map(norm).filter(Boolean),
});

const STOP = new Set([
  "the", "and", "for", "from", "with", "her", "his", "their", "them", "him", "she", "they", "you", "your", "that", "this", "into",
  "onto", "before", "after", "about", "what", "when", "will", "would", "could", "should", "want", "intend", "plan", "going", "get",
  "make", "out", "off", "own", "its", "who", "all", "any", "some", "then", "than", "there", "here", "tonight", "today", "now",
]);

const STATE_VERB = /^(wants?|intends?|plans?|means?|hopes?|wish(es)?|desires?|seems?|clearly|is going|will|would|must|surely|probably|likely)\b/;

const stem = (word: string) => word.replace(/(ing|ed|es|s)$/, (suffix, offset: number) => (offset >= 3 ? "" : suffix));

const contentWords = (text: string, skip: Set<string>) => new Set(
  (text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []).filter((word) => word.length >= 3 && !STOP.has(word) && !skip.has(word)).map(stem),
);

const unquoted = (text: string) => text.replace(/"[^"]*"|“[^”]*”|«[^»]*»/g, " ");

const sentences = (text: string) => text.split(/(?<=[.!?…])\s+|\n+/).map((sentence) => sentence.trim()).filter(Boolean);

const actsAs = (sentence: string, subject: string) => {
  const lower = sentence.toLowerCase().replace(/^[^\p{L}\p{N}]+/u, "");
  if (!lower.startsWith(subject)) return false;
  const rest = lower.slice(subject.length);
  if (/^[\p{L}\p{N}]/u.test(rest)) return false;
  return !STATE_VERB.test(rest.replace(/^[^\p{L}\p{N}]+/u, ""));
};

const attributedText = (evidence: IntentEvidence, subject: string) => evidence.characters.flatMap((message) => (message.speaker === subject
  ? [message.text]
  : sentences(unquoted(message.text)).filter((sentence) => actsAs(sentence, subject))));

export const admitIntents = (signals: ParsedEpistemicSignal[], evidence: IntentEvidence | null): ParsedEpistemicSignal[] => signals.filter((signal) => {
  if (signal.tag !== "intends") return true;
  const subject = norm(signal.subject);
  if (!evidence || !subject || evidence.players.includes(subject) || isMetaCommentary(signal.content)) return false;
  const skip = new Set(subject.split(/\s+/));
  const claimed = contentWords(signal.content, skip);
  if (!claimed.size) return false;
  return attributedText(evidence, subject).some((text) => [...contentWords(text, skip)].some((word) => claimed.has(word)));
});

export const capIntents = (entries: EpistemicEntry[], cap: number = INTENT_OPEN_CAP): EpistemicEntry[] => {
  const counts = new Map<string, number>();
  const drop = new Set<string>();
  for (const entry of [...entries].reverse()) {
    if (entry.tag !== "intends" || entry.pinned || entry.supersededBy) continue;
    const count = (counts.get(norm(entry.subject)) ?? 0) + 1;
    counts.set(norm(entry.subject), count);
    if (count > cap) drop.add(entry.id);
  }
  return drop.size ? entries.filter((entry) => !drop.has(entry.id)) : entries;
};

export const renderOwnAims = (voice: CastVoice | undefined): string => {
  const lines = [
    voice?.drive ? `- What you want: ${voice.drive}` : "",
    voice?.motive ? `- Right now: ${voice.motive}` : "",
    voice?.beat ? `- Your intent this turn: ${voice.beat}` : "",
  ].filter(Boolean);
  return lines.length ? ["Your private aims (act on them in character; never announce them):", ...lines].join("\n") : "";
};

const NARRATOR_TAGS: EpistemicTag[] = ["hiding", "intends", "knows"];

export const NARRATOR_HEADER = "What the cast privately holds (use this to foreshadow; reveal nothing a character conceals unless the scene reveals it):";

export const NARRATOR_SELF_VOICED = "These characters speak and act for themselves on their own turns; never write their words or choices:";
export const NARRATOR_NAMED_FIRST = "Voice anyone else the scene needs, and when the story already names someone who fits, use them rather than inventing a stranger.";

const renderSelfVoiced = (voices: CastVoice[], self: string): string => {
  const names = voices.filter((voice) => voice.selfVoiced && voice.id !== self).map((voice) => voice.name);
  return names.length ? `${NARRATOR_SELF_VOICED} ${names.join(", ")}.\n${NARRATOR_NAMED_FIRST}` : "";
};

export interface NarratorScope {
  onStage: ReadonlySet<string>;
  cast: ReadonlySet<string>;
  lastNamed: ReadonlyMap<string, number>;
  budget: number;
}

interface ScopeStory {
  roster: ReadonlyArray<{ id: string; name?: string; aliases?: string[] }>;
  checkpointById: Record<string, { motives?: Record<string, string>; talk_control?: { speakers?: Array<{ member: string }>; lead?: string } } | undefined>;
}

type ScopeRow = { name?: unknown; mes?: unknown; is_system?: boolean } | null | undefined;

export const checkpointCast = (story: ScopeStory, checkpointId: string | null, enabledIds: readonly string[]): string[] => {
  const checkpoint = checkpointId ? story.checkpointById[checkpointId] : undefined;
  const talk = checkpoint?.talk_control;
  const refs = [...Object.keys(checkpoint?.motives ?? {}), ...(talk?.speakers ?? []).map((speaker) => speaker.member), ...(talk?.lead ? [talk.lead] : [])];
  const resolved = refs.map((ref) => story.roster.find((member) => norm(member.id) === norm(ref) || norm(castCardName(member)) === norm(ref))?.id);
  return [...new Set([...enabledIds, ...resolved.filter((id): id is string => Boolean(id))])];
};

export const narratorScope = (
  story: ScopeStory, checkpointId: string | null, enabledIds: readonly string[], rows: unknown[],
  window: number = NARRATOR_HOLDINGS_WINDOW, budget: number = NARRATOR_HOLDINGS_TOKEN_BUDGET,
): NarratorScope => {
  const named = nameMatcher(story.roster.map((member) => ({
    rosterId: member.id, name: castCardName(member), weight: 1, ...(member.aliases?.length ? { aliases: member.aliases } : {}),
  })));
  const recent = (rows as ScopeRow[]).filter((row) => row && !row.is_system).slice(-Math.max(1, window));
  const lastNamed = new Map<string, number>();
  recent.forEach((row, index) => {
    const text = [row?.name, row?.mes].filter((part): part is string => typeof part === "string").join("\n");
    for (const id of named(text)) lastNamed.set(id, index);
  });
  return { onStage: new Set(enabledIds), cast: new Set(checkpointCast(story, checkpointId, enabledIds)), lastNamed, budget };
};

export const renderNarratorBlock = (entries: EpistemicEntry[], voices: CastVoice[], self: string, scope?: NarratorScope): string =>
  joinBlocks(renderSelfVoiced(voices, self), renderNarratorHoldings(entries, voices, self, scope));

interface Holding {
  id: string;
  order: number;
  lines: string[];
}

const scopedHoldings = (holdings: Holding[], scope: NarratorScope): Holding[] => {
  const recency = (holding: Holding) => scope.lastNamed.get(holding.id) ?? -1;
  const inScope = holdings.filter((holding) => scope.cast.has(holding.id) || scope.lastNamed.has(holding.id))
    .sort((a, b) => recency(b) - recency(a) || a.order - b.order);
  const cost = (holding: Holding) => estimateTokens(holding.lines.join("\n"));
  const admitted = new Set(inScope.filter((holding) => scope.onStage.has(holding.id)));
  let used = 0;
  for (const holding of inScope) {
    if (admitted.has(holding) || used + cost(holding) > scope.budget) continue;
    admitted.add(holding);
    used += cost(holding);
  }
  return inScope.filter((holding) => admitted.has(holding));
};

const renderNarratorHoldings = (entries: EpistemicEntry[], voices: CastVoice[], self: string, scope?: NarratorScope): string => {
  const active = activeEpistemic(entries);
  const holdings = voices.filter((voice) => voice.id !== self).map((voice, order): Holding => {
    const subject = new Set([norm(voice.name), norm(voice.id)]);
    const rows = NARRATOR_TAGS.flatMap((tag) => active.filter((entry) => entry.tag === tag && subject.has(norm(entry.subject))))
      .map((entry) => attributedEpistemicLine(voice.name, entry));
    const aims = [
      voice.drive ? `- ${voice.name} wants: ${voice.drive}` : "",
      voice.motive ? `- ${voice.name}, right now: ${voice.motive}` : "",
      voice.beat ? `- ${voice.name} is about to: ${voice.beat}` : "",
    ].filter(Boolean);
    return { id: voice.id, order, lines: [...aims, ...rows].slice(0, NARRATOR_SUBJECT_CAP) };
  }).filter((holding) => holding.lines.length);
  const lines = (scope ? scopedHoldings(holdings, scope) : holdings).flatMap((holding) => holding.lines);
  return lines.length ? [NARRATOR_HEADER, ...lines].join("\n") : "";
};

type ReasoningRow = { name?: unknown; is_user?: boolean; is_system?: boolean; extra?: { reasoning?: unknown } } | null | undefined;

export const harvestReasoning = (rows: unknown[], window: { from: number; to: number }): string => {
  const lines = (rows as ReasoningRow[]).slice(Math.max(0, window.from), window.to + 1).flatMap((row) => {
    if (!row || row.is_user || row.is_system || typeof row.name !== "string" || typeof row.extra?.reasoning !== "string") return [];
    const kept = row.extra.reasoning.split(/(?<=[.!?])\s+/).filter((sentence) => sentence.trim() && !isMetaCommentary(sentence)).join(" ").trim();
    return kept ? [`${row.name}: ${kept.slice(0, HARVEST_CHARS)}`] : [];
  });
  return lines.length ? [HARVEST_HEADER, ...lines].join("\n") : "";
};

type ChatRow = { is_user?: boolean; is_system?: boolean } | null | undefined;

export const beatAnchorId = (rows: unknown[]): number => {
  const typed = rows as ChatRow[];
  let end = typed.length - 1;
  for (let index = typed.length - 1; index >= 0; index -= 1) {
    if (typed[index]?.is_user) { end = index - 1; break; }
  }
  for (let index = end; index >= 0; index -= 1) {
    const row = typed[index];
    if (row && !row.is_user && !row.is_system) return index;
  }
  return -1;
};

export interface BeatAnchor {
  chatId: string | null;
  checkpointId: string | null;
  basedOn: number;
  upTo?: number;
}

export const turnAnchor = (chatId: string | null, checkpointId: string | null, rows: unknown[]): BeatAnchor =>
  ({ chatId, checkpointId, basedOn: beatAnchorId(rows), upTo: rows.length - 1 });

export const freshBeat = (beats: InnerBeat[] | undefined, memberId: string, anchor: BeatAnchor): InnerBeat | null =>
  (beats ?? []).filter((beat) => beat.memberId === memberId && beat.chatId === anchor.chatId && beat.checkpointId === anchor.checkpointId
    && beat.basedOnMessageId >= anchor.basedOn && beat.basedOnMessageId <= (anchor.upTo ?? anchor.basedOn))
    .reduce<InnerBeat | null>((newest, beat) => (newest && newest.basedOnMessageId > beat.basedOnMessageId ? newest : beat), null);

export const pushBeat = (beats: InnerBeat[] | undefined, beat: InnerBeat): InnerBeat[] =>
  [...(beats ?? []).filter((entry) => !(entry.memberId === beat.memberId && entry.chatId === beat.chatId && entry.basedOnMessageId === beat.basedOnMessageId)), beat]
    .slice(-BEAT_RING_CAP);

export const memberAimsBlock = (voices: CastVoice[], id: string, beat: string, known: EpistemicEntry[], privateBlock: string, scope?: NarratorScope): string => {
  const voice = voices.find((candidate) => candidate.id === id);
  const own = renderOwnAims(voice && beat ? { ...voice, beat } : voice);
  return joinBlocks(own, voice?.omniscient ? renderNarratorBlock(known, voices, id, scope) : privateBlock);
};

export interface BeatPorts {
  beats: InnerBeat[];
  chatId: string;
  checkpointId: string | null;
  rows: unknown[];
  name: string;
  journal: (summary: string, note?: string) => void;
  setBeats: (next: InnerBeat[]) => void;
}

export const takeBeat = (rosterId: string, ports: BeatPorts): string => {
  const anchor = turnAnchor(ports.chatId, ports.checkpointId, ports.rows);
  const beat = freshBeat(ports.beats, rosterId, anchor);
  if (!beat) {
    const held = ports.beats.some((entry) => entry.memberId === rosterId && entry.chatId === anchor.chatId);
    ports.journal(held ? `Inner beat stale for ${ports.name}` : `No inner beat for ${ports.name}`, held ? "built on an older reply, another checkpoint or another chat" : undefined);
    return "";
  }
  if (!beat.used) ports.setBeats(ports.beats.map((entry) => (entry === beat ? { ...entry, used: true } : entry)));
  ports.journal(`Inner beat used for ${ports.name}`);
  return beat.beat;
};
