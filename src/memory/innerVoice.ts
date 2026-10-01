import type { EpistemicEntry, InnerBeat } from "./types";

type InnerRender = typeof import("./innerRender");

let loadedRender: InnerRender | null = null;
let pendingRender: Promise<InnerRender> | null = null;

export const innerRender = (): InnerRender | null => loadedRender;

export const loadInnerRender = (): Promise<InnerRender> => (pendingRender ??= import("./innerRender").then((module) => (loadedRender = module)));

export const INTENT_LAPSE_SCENES = 3;
export const MEDIAN_BOUNDARIES_PER_SCENE = 8;
export const INTENT_LAPSE_K_PROVISIONAL = true;
export const INTENT_LAPSE_BOUNDARIES = 3 * MEDIAN_BOUNDARIES_PER_SCENE;
export const BEAT_RING_CAP = 6;

export interface IntentClock {
  boundary: number;
  derived: Array<{ kind: string; messageId: number }>;
}

export const lastAffirmed = (entry: EpistemicEntry): { messageId: number; boundary: number } => entry.affirmedAt?.at(-1) ?? { messageId: entry.messageId ?? -1, boundary: entry.createdAt };

export const intentLapsed = (entry: EpistemicEntry, clock: IntentClock): boolean => {
  if (entry.tag !== "intends" || entry.pinned || entry.locked) return false;
  const last = lastAffirmed(entry);
  if (clock.boundary - last.boundary >= INTENT_LAPSE_BOUNDARIES) return true;
  return clock.derived.filter((record) => record.kind === "scene_summary" && record.messageId > last.messageId).length >= INTENT_LAPSE_SCENES;
};

export const withoutLapsedIntents = (entries: EpistemicEntry[], clock: IntentClock): EpistemicEntry[] => entries.filter((entry) => !intentLapsed(entry, clock));

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
  const voice: CastVoice = { id: member.id, name: member.name ?? member.id };
  const motive = checkpointId ? story?.checkpointById[checkpointId]?.motives?.[member.id] : undefined;
  if (member.drive) voice.drive = member.drive;
  if (motive) voice.motive = motive;
  if (member.view === "omniscient") voice.omniscient = true;
  return voice;
});

export const hasInnerVoice = (voices: CastVoice[]): boolean => voices.some((voice) => voice.drive || voice.motive || voice.beat || voice.omniscient);

export const joinBlocks = (first: string, second: string): string => (first && second ? `${first}\n\n${second}` : first || second);

export const rollbackBeats = (beats: InnerBeat[] | undefined, messageId: number): InnerBeat[] | undefined =>
  beats?.filter((beat) => beat.basedOnMessageId < messageId);
