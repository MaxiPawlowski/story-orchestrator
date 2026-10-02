import { activeEpistemic, attributedEpistemicLine, BEAT_RING_CAP, joinBlocks, type CastVoice } from "./index";
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

export const renderCastAims = (voices: CastVoice[]): string => {
  const lines = voices.flatMap((voice) => [
    voice.drive ? `- ${voice.name} wants: ${voice.drive}` : "",
    voice.motive ? `- ${voice.name}, right now: ${voice.motive}` : "",
  ]).filter(Boolean);
  return lines.length ? ["What each character privately wants (voice each accordingly; never announce it):", ...lines].join("\n") : "";
};

const NARRATOR_TAGS: EpistemicTag[] = ["hiding", "intends", "knows"];

export const NARRATOR_HEADER = "What the cast privately holds (use this to foreshadow; reveal nothing a character conceals unless the scene reveals it):";

export const NARRATOR_SELF_VOICED = "These characters speak and act for themselves on their own turns; never write their words or choices:";
export const NARRATOR_NAMED_FIRST = "Voice anyone else the scene needs, and when the story already names someone who fits, use them rather than inventing a stranger.";

const renderSelfVoiced = (voices: CastVoice[], self: string): string => {
  const names = voices.filter((voice) => voice.selfVoiced && voice.id !== self).map((voice) => voice.name);
  return names.length ? `${NARRATOR_SELF_VOICED} ${names.join(", ")}.\n${NARRATOR_NAMED_FIRST}` : "";
};

export const renderNarratorBlock = (entries: EpistemicEntry[], voices: CastVoice[], self: string): string =>
  joinBlocks(renderSelfVoiced(voices, self), renderNarratorHoldings(entries, voices, self));

const renderNarratorHoldings = (entries: EpistemicEntry[], voices: CastVoice[], self: string): string => {
  const active = activeEpistemic(entries);
  const lines = voices.filter((voice) => voice.id !== self).flatMap((voice) => {
    const subject = new Set([norm(voice.name), norm(voice.id)]);
    const rows = NARRATOR_TAGS.flatMap((tag) => active.filter((entry) => entry.tag === tag && subject.has(norm(entry.subject))))
      .map((entry) => attributedEpistemicLine(voice.name, entry));
    const aims = [
      voice.drive ? `- ${voice.name} wants: ${voice.drive}` : "",
      voice.motive ? `- ${voice.name}, right now: ${voice.motive}` : "",
      voice.beat ? `- ${voice.name} is about to: ${voice.beat}` : "",
    ].filter(Boolean);
    return [...aims, ...rows].slice(0, NARRATOR_SUBJECT_CAP);
  });
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

export const memberAimsBlock = (voices: CastVoice[], id: string, beat: string, known: EpistemicEntry[], privateBlock: string): string => {
  const voice = voices.find((candidate) => candidate.id === id);
  const own = renderOwnAims(voice && beat ? { ...voice, beat } : voice);
  return joinBlocks(own, voice?.omniscient ? renderNarratorBlock(known, voices, id) : privateBlock);
};

export const soloAims = (voices: CastVoice[], beat = ""): string =>
  voices.length === 1 ? renderOwnAims(beat ? { ...voices[0], beat } : voices[0]) : renderCastAims(voices);

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
