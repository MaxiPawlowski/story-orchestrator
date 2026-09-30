import { isMetaCommentary } from "./innerRender";

export interface InnerBeatPromptInput {
  storyTitle: string;
  memberName: string;
  checkpointName: string;
  objective: string;
  agency: string;
  steering: string;
  privateRows: string;
  window: Array<{ speaker: string; text: string }>;
}

export interface ParsedInnerBeat {
  beat: string;
  tone?: string;
}

export const INNER_BEAT_MAX_TOKENS = 96;
export const INNER_BEAT_MAX_CHARS = 240;

export function renderInnerBeatPrompt(input: InnerBeatPromptInput): string {
  return [
    "[PRIVATE NOTE TASK — do NOT continue the roleplay. Output only the lines asked for.]",
    `Story: ${input.storyTitle}`,
    `Scene: ${input.checkpointName} — ${input.objective}`,
    ...(input.steering ? [`Pacing: ${input.steering}`] : []),
    "Rules of play:",
    input.agency,
    "",
    `Decide what ${input.memberName} is trying to do in their next reply, from their own point of view.`,
    `Use only what ${input.memberName} wants and knows below. Never decide what the player does, says or feels.`,
    ...(input.privateRows ? ["", `${input.memberName}'s private aims and knowledge:`, input.privateRows] : []),
    "",
    "Recent transcript:",
    ...input.window.map((message) => `${message.speaker}: ${message.text}`),
    "",
    "Answer with exactly these lines:",
    `BEAT: <one sentence: what ${input.memberName} is trying to do next>`,
    "TONE: <one word>",
  ].join("\n");
}

export const INNER_BEAT_REPAIR = "Your answer did not follow the format. Answer again with exactly one line `BEAT: <one sentence>` and optionally `TONE: <one word>`.";

const clean = (value: string) => value.trim().replace(/^["'*_`]+|["'*_`]+$/g, "").trim();

export function parseInnerBeat(raw: string): ParsedInnerBeat | null {
  let beat = "";
  let tone = "";
  for (const line of raw.split(/\r?\n/)) {
    const beatMatch = line.match(/^\s*BEAT\s*[:=]\s*(.+)$/i);
    if (beatMatch && !beat) beat = clean(beatMatch[1]);
    const toneMatch = line.match(/^\s*TONE\s*[:=]\s*(.+)$/i);
    if (toneMatch && !tone) tone = clean(toneMatch[1]).split(/\s+/)[0] ?? "";
  }
  if (!beat || beat.length > INNER_BEAT_MAX_CHARS || isMetaCommentary(beat)) return null;
  return { beat, ...(tone ? { tone: tone.toLowerCase() } : {}) };
}
