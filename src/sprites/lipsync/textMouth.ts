import { preProcessText, wordsToVisemes, type VisemeTrack } from "./lipsyncEn";
import type { MouthSample } from "../mouthShape";
import { DEFAULT_MOUTH_CONFIG, type MouthConfig, type MouthTarget, type MouthTiming } from "../mouthConfig";

export const VISEME_MOUTH = DEFAULT_MOUTH_CONFIG.visemes;
const VOWEL_VISEMES = new Set(["aa", "E", "EE", "I", "O", "U"]);
const LETTER_VISEMES: Record<string, string> = { A: "aa", E: "E", I: "I", O: "O", U: "U", Y: "I", B: "PP", M: "PP", P: "PP", F: "FF", V: "FF",
  S: "SS", Z: "SS", C: "kk", G: "kk", K: "kk", Q: "kk", X: "kk", D: "DD", T: "DD", L: "nn", N: "nn", R: "RR", W: "U", J: "CH", H: "kk" };

export function timedTrack(word: string, timing: MouthTiming): VisemeTrack {
  if (timing === "character") {
    const letters = [...word.toUpperCase()];
    return { words: word, visemes: letters.map((letter) => LETTER_VISEMES[letter] ?? "nn"), times: letters.map((_, index) => index), durations: letters.map(() => 1) };
  }
  const track = wordsToVisemes(preProcessText(word));
  if (timing === "word") return track;
  const out: VisemeTrack = { words: track.words, visemes: [], times: [], durations: [] };
  let start = -1, end = 0, consonant = "";
  const emit = (viseme: string) => { out.visemes.push(viseme); out.times.push(start); out.durations.push(end - start); start = -1; consonant = ""; };
  track.visemes.forEach((viseme, index) => {
    if (start < 0) start = track.times[index];
    end = track.times[index] + track.durations[index];
    if (VOWEL_VISEMES.has(viseme)) emit(viseme);
    else consonant ||= viseme;
  });
  if (start >= 0) {
    if (out.visemes.length) { const last = out.durations.length - 1; out.durations[last] = end - out.times[last]; } else emit(consonant || "nn");
  }
  return out;
}

export const TEXT_MOUTH = {
  charMs: 55, minCharMs: 25, maxCharMs: 140, minUnitMs: 30, maxUnitMs: 160, maxLagMs: 700, idleFlushMs: 180, easeMs: 50, floorUnitMs: 18,
} as const;

const PAUSES: Record<string, number> = { " ": 1, "\n": 3, ",": 3, "-": 0.5, ";": 2, ":": 2, ".": 4, "!": 4, "?": 4, "…": 4 };
const WORD_CHAR = /[\p{L}\p{N}'’]/u;
const CLOSED = { open: 0, form: 0 };

interface Cue { viseme: string; start: number; end: number; from: { open: number; form: number } }

const clamp = (value: number, low: number, high: number) => Math.min(high, Math.max(low, value));

export class TextMouth {
  private text: string;
  private word = "";
  private lastAt: number | null = null;
  private charMs: number = TEXT_MOUTH.charMs;
  private cursor = -Infinity;
  private cues: Cue[] = [];
  private tail: MouthTarget = CLOSED;

  constructor(spoken = "", private readonly config: MouthConfig = DEFAULT_MOUTH_CONFIG) { this.text = spoken; }

  private target(viseme: string): MouthTarget { return this.config.visemes[viseme] ?? this.config.unknownViseme; }

  push(text: string, now: number): void {
    if (!text.startsWith(this.text)) { this.text = text; this.word = ""; return; }
    const fresh = [...text.slice(this.text.length)];
    this.text = text;
    if (!fresh.length) return;
    if (this.lastAt !== null) {
      const measured = clamp((now - this.lastAt) / fresh.length, TEXT_MOUTH.minCharMs, TEXT_MOUTH.maxCharMs);
      this.charMs = this.charMs * 0.7 + measured * 0.3;
    }
    this.lastAt = now;
    for (const char of fresh) {
      if (WORD_CHAR.test(char)) { this.word += char; continue; }
      this.flush(now);
      this.pause(PAUSES[char] ?? 0, now);
    }
  }

  sample(now: number): MouthSample | null {
    if (this.word && this.lastAt !== null && now - this.lastAt >= TEXT_MOUTH.idleFlushMs) this.flush(this.lastAt + TEXT_MOUTH.idleFlushMs);
    while (this.cues.length && this.cues[0].end <= now) this.cues.shift();
    const cue = this.cues[0];
    if (!cue || cue.start > now) return null;
    const goal = this.target(cue.viseme);
    const span = Math.max(1, Math.min(TEXT_MOUTH.easeMs, (cue.end - cue.start) / 2));
    const x = clamp((now - cue.start) / span, 0, 1), ease = x * x * (3 - 2 * x);
    return { viseme: cue.viseme, open: cue.from.open + (goal.open - cue.from.open) * ease, form: cue.from.form + (goal.form - cue.from.form) * ease };
  }

  private pause(units: number, now: number): void {
    if (!units) return;
    const start = Math.max(this.cursor, now);
    if (start - now >= TEXT_MOUTH.maxLagMs) return;
    this.cursor = start + units * clamp(this.charMs, TEXT_MOUTH.minUnitMs, TEXT_MOUTH.maxUnitMs);
    this.tail = CLOSED;
  }

  private flush(now: number): void {
    if (!this.word) return;
    const word = this.word;
    this.word = "";
    const track = timedTrack(word, this.config.timing);
    const last = track.visemes.length - 1;
    if (last < 0) return;
    const units = track.times[last] + track.durations[last];
    const start = Math.max(this.cursor, now);
    if (start > this.cursor) this.tail = CLOSED;
    const lag = start - now;
    if (lag > TEXT_MOUTH.maxLagMs * 2) return;
    let unitMs = clamp((word.length * this.charMs) / units, TEXT_MOUTH.minUnitMs, TEXT_MOUTH.maxUnitMs);
    if (lag > TEXT_MOUTH.maxLagMs) unitMs = Math.max(TEXT_MOUTH.floorUnitMs, unitMs * TEXT_MOUTH.maxLagMs / lag);
    track.visemes.forEach((viseme, index) => {
      const cueStart = start + track.times[index] * unitMs;
      const previous = this.cues[this.cues.length - 1];
      const from = previous && Math.abs(previous.end - cueStart) < 1 ? this.target(previous.viseme) : index === 0 ? this.tail : CLOSED;
      this.cues.push({ viseme, start: cueStart, end: cueStart + track.durations[index] * unitMs, from });
    });
    this.tail = this.target(track.visemes[last]);
    this.cursor = start + units * unitMs;
  }
}

export const createTextMouth = (spoken: string, config: MouthConfig = DEFAULT_MOUTH_CONFIG): TextMouth => new TextMouth(spoken, config);
