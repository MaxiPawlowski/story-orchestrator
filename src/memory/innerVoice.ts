import { activeEpistemic, attributedEpistemicLine } from "./epistemic";
import type { EpistemicEntry, EpistemicTag, InnerBeat, ParsedEpistemicSignal } from "./types";

export const INTENT_LAPSE_SCENES = 3;
export const PROVISIONAL_MEDIAN_BOUNDARIES_PER_SCENE = 8;
export const INTENT_LAPSE_BOUNDARIES = 3 * PROVISIONAL_MEDIAN_BOUNDARIES_PER_SCENE;
export const INTENT_OPEN_CAP = 3;
export const BEAT_RING_CAP = 6;
export const NARRATOR_SUBJECT_CAP = 6;

const norm = (value: string) => value.trim().toLowerCase();

const META = new RegExp([
  "\\bi (should|will|need to|must) (write|respond|reply|continue|describe|narrate)",
  "\\bthe user\\b", "\\bthe player (wants|asked|expects)", "\\bas an ai\\b",
  "\\b(this|my|the next) (reply|response|message)\\b", "\\bin character\\b", "\\broleplay", "\\{\\{(user|char)\\}\\}",
].join("|"), "i");

export const isMetaCommentary = (text: string): boolean => META.test(text);

export interface IntentEvidence {
  characterText: string;
  speakers: string[];
  players: string[];
}

export const intentEvidence = (messages: Array<{ speaker: string; text: string; isUser: boolean }>, players: string[]): IntentEvidence => {
  const characters = messages.filter((message) => !message.isUser);
  return {
    characterText: characters.map((message) => `${message.speaker}: ${message.text}`).join("\n").toLowerCase(),
    speakers: characters.map((message) => norm(message.speaker)),
    players: [...players, ...messages.filter((message) => message.isUser).map((message) => message.speaker)].map(norm).filter(Boolean),
  };
};

const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const names = (text: string, name: string) => new RegExp(`(^|[^\\p{L}\\p{N}])${escapeRegex(name)}($|[^\\p{L}\\p{N}])`, "u").test(text);

export const admitIntents = (signals: ParsedEpistemicSignal[], evidence: IntentEvidence | null): ParsedEpistemicSignal[] => signals.filter((signal) => {
  if (signal.tag !== "intends") return true;
  const subject = norm(signal.subject);
  if (!evidence || !subject || evidence.players.includes(subject) || isMetaCommentary(signal.content)) return false;
  return evidence.speakers.includes(subject) || names(evidence.characterText, subject);
});

export interface IntentClock {
  boundary: number;
  derived: Array<{ kind: string; messageId: number }>;
}

const lastAffirmed = (entry: EpistemicEntry) => entry.affirmedAt?.at(-1) ?? { messageId: entry.messageId ?? -1, boundary: entry.createdAt };

export const intentLapsed = (entry: EpistemicEntry, clock: IntentClock): boolean => {
  if (entry.tag !== "intends" || entry.pinned || entry.locked) return false;
  const last = lastAffirmed(entry);
  if (clock.boundary - last.boundary >= INTENT_LAPSE_BOUNDARIES) return true;
  return clock.derived.filter((record) => record.kind === "scene_summary" && record.messageId > last.messageId).length >= INTENT_LAPSE_SCENES;
};

export const withoutLapsedIntents = (entries: EpistemicEntry[], clock: IntentClock): EpistemicEntry[] => entries.filter((entry) => !intentLapsed(entry, clock));

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

export interface CastVoice {
  id: string;
  name: string;
  drive?: string;
  motive?: string;
  beat?: string;
  omniscient?: boolean;
}

interface VoiceStory {
  roster: Array<{ id: string; name?: string; drive?: string; view?: string }>;
  checkpointById: Record<string, { motives?: Record<string, string> } | undefined>;
}

export const castVoices = (story: VoiceStory | null, checkpointId: string | null): CastVoice[] => (story?.roster ?? []).map((member) => {
  const motive = checkpointId ? story?.checkpointById[checkpointId]?.motives?.[member.id] : undefined;
  return {
    id: member.id,
    name: member.name ?? member.id,
    ...(member.drive ? { drive: member.drive } : {}),
    ...(motive ? { motive } : {}),
    ...(member.view === "omniscient" ? { omniscient: true } : {}),
  };
});

export const hasInnerVoice = (voices: CastVoice[]): boolean => voices.some((voice) => voice.drive || voice.motive || voice.beat || voice.omniscient);

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

export const renderNarratorBlock = (entries: EpistemicEntry[], voices: CastVoice[], self: string): string => {
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

export const HARVEST_CHARS = 600;

type ReasoningRow = { name?: unknown; is_user?: boolean; is_system?: boolean; extra?: { reasoning?: unknown } } | null | undefined;

export const harvestReasoning = (rows: unknown[], window: { from: number; to: number }): string => (rows as ReasoningRow[])
  .slice(Math.max(0, window.from), window.to + 1)
  .flatMap((row) => {
    if (!row || row.is_user || row.is_system || typeof row.name !== "string" || typeof row.extra?.reasoning !== "string") return [];
    const kept = row.extra.reasoning.split(/(?<=[.!?])\s+/).filter((sentence) => sentence.trim() && !isMetaCommentary(sentence)).join(" ").trim();
    return kept ? [`${row.name}: ${kept.slice(0, HARVEST_CHARS)}`] : [];
  })
  .join("\n");

export const joinBlocks = (...blocks: string[]): string => blocks.filter(Boolean).join("\n\n");

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
}

export const freshBeat = (beats: InnerBeat[] | undefined, memberId: string, anchor: BeatAnchor): InnerBeat | null =>
  [...(beats ?? [])].reverse().find((beat) => beat.memberId === memberId && beat.chatId === anchor.chatId && beat.checkpointId === anchor.checkpointId
    && beat.basedOnMessageId === anchor.basedOn) ?? null;

export const pushBeat = (beats: InnerBeat[] | undefined, beat: InnerBeat): InnerBeat[] =>
  [...(beats ?? []).filter((entry) => !(entry.memberId === beat.memberId && entry.chatId === beat.chatId && entry.basedOnMessageId === beat.basedOnMessageId)), beat]
    .slice(-BEAT_RING_CAP);

export const rollbackBeats = (beats: InnerBeat[] | undefined, messageId: number): InnerBeat[] | undefined =>
  beats?.filter((beat) => beat.basedOnMessageId < messageId);
