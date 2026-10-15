import { TYPED_EVIDENCE_CHARS } from "@judge/index";
import type { NormalizedStoryV2, StoryEngine } from "@engine/index";
import type { BeatReading, HeldBeat } from "@engine/life/beats";
import { gameLayer } from "@engine/validate/gameLayer";

export interface HeldReading {
  key: string;
  value: string;
  evidence: string;
  reason?: string;
  playerLine?: string;
  messageId?: number;
  sourceChars?: number;
}

export const HELD_QUOTE_CHARS = 120;

export const freshBeats = <T extends BeatReading>(story: NormalizedStoryV2 | null, engine: StoryEngine, readings: T[]): { accepted: T[]; held: HeldBeat[] } =>
  (story?.life && gameLayer()?.life.holdSameBeat(story, engine.stateLog, engine.pendingWrites, engine.serialize().boundary, readings)) || { accepted: readings, held: [] };

const quote = (text: string) => `"${text.slice(0, HELD_QUOTE_CHARS)}"`;

const cut = (entry: HeldReading) => entry.sourceChars === undefined || entry.messageId === undefined ? ""
  : `, evidence cut to the first ${TYPED_EVIDENCE_CHARS} of ${entry.sourceChars} characters of message ${entry.messageId}`;

export const heldNote = (held: readonly HeldReading[]): string => held.map((entry) => [
  `${entry.key}="${entry.value}"${entry.reason ? ` (${entry.reason})` : ""} from ${quote(entry.evidence)}${cut(entry)}`,
  entry.playerLine !== undefined ? `, the player wrote ${quote(entry.playerLine)}` : "",
].join("")).join("; ");
