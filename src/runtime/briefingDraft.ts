import { castCardName, resolveCastChanges, type BriefingSection, type StoryV2, type ValidationError } from "@engine/index";
import { readBriefing } from "@engine/validate/briefing";
import { stripReasoningBlocks } from "@extraction/parse";
import { isRecord } from "@utils/guards";
import { normalizeJsonText } from "@utils/json";
import { briefingSpoilerNames } from "../studio/briefingDiagnostics";

export const BRIEFING_DRAFT_MAX_TOKENS = 1200;

export interface BriefingDraftInput {
  title: string;
  intro: string | null;
  start: string | null;
  player: { role: string | null; summary: string | null; assumes: string[] } | null;
  cast: string[];
  scenario: string | null;
}

type DraftStory = Pick<StoryV2, "title" | "player_intro" | "player" | "roster" | "checkpoints">;

const clean = (value: unknown): string | null => (typeof value === "string" && value.trim() ? value.trim() : null);

const startOf = (story: DraftStory) => story.checkpoints.find((checkpoint) => checkpoint.start) ?? story.checkpoints[0];

export const briefingDraftInput = (story: DraftStory): BriefingDraftInput => {
  const start = startOf(story);
  const muted = new Set((resolveCastChanges(story.roster, start?.effects?.cast_changes)?.changes.disable ?? []).map((name) => name.trim().toLowerCase()));
  const cast = story.roster
    .filter((member) => !muted.has(castCardName(member).toLowerCase()) && !muted.has(member.id.toLowerCase()))
    .map(castCardName);
  const player = story.player;
  const role = clean(player?.role);
  const summary = clean(player?.summary);
  const assumes = (player?.assumes ?? []).map(clean).filter((line): line is string => line !== null);
  return {
    title: story.title.trim(),
    intro: clean(story.player_intro),
    start: clean(start?.player_name),
    player: role || summary || assumes.length ? { role, summary, assumes } : null,
    cast: [...new Set(cast)],
    scenario: clean(start?.effects?.scenario),
  };
};

const facts = (input: BriefingDraftInput): string[] => [
  `Story: ${input.title}`,
  ...(input.intro ? [`What the player is told about it: ${input.intro}`] : []),
  ...(input.start ? [`The opening scene: ${input.start}`] : []),
  ...(input.scenario ? [`The opening situation: ${input.scenario}`] : []),
  ...(input.player?.role ? [`The player plays: ${input.player.role}`] : []),
  ...(input.player?.summary ? [`About the player's character: ${input.player.summary}`] : []),
  ...(input.player?.assumes.length ? [`The story takes for granted: ${input.player.assumes.join("; ")}`] : []),
  ...(input.cast.length ? [`In the scene at the start: ${input.cast.join(", ")}`] : []),
];

export const renderBriefingDraftPrompt = (input: BriefingDraftInput): string => [
  "Write the short page a player reads before an interactive story starts. Use ONLY the facts below; invent no names, places, events or outcomes, "
    + "and say nothing about what happens later.",
  facts(input).join("\n"),
  "Write 2 to 4 sections, each a heading and 1 to 3 short paragraphs of plain text, in the second person: where you are, who you are, who is with you (only the "
    + "characters listed), and how to play (write what you do and say; the characters answer and the story moves on when what it needs has happened). "
    + "Leave out a section the facts do not support. No macros like {{user}}, no markdown, no HTML.",
  'Return exact JSON only: { "sections": [{ "heading": string, "text": string }] }',
].join("\n\n");

export type BriefingDraftCheck = { ok: true; sections: BriefingSection[] } | { ok: false; reason: string };

const readSections = (raw: string): BriefingDraftCheck => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(normalizeJsonText(stripReasoningBlocks(raw)));
  } catch {
    return { ok: false, reason: "the reply was not readable JSON" };
  }
  const errors: ValidationError[] = [];
  const briefing = readBriefing({ sections: isRecord(parsed) ? parsed.sections : undefined }, "briefing", errors);
  if (errors.length || !briefing?.sections.length) return { ok: false, reason: errors.map((error) => `${error.path}: ${error.message}`).join("; ") || "no sections" };
  return { ok: true, sections: briefing.sections };
};

export const checkBriefingDraft = (story: StoryV2, raw: string): BriefingDraftCheck => {
  const read = readSections(raw);
  if (!read.ok) return read;
  const spoilers = briefingSpoilerNames(story, { sections: read.sections });
  return spoilers.length ? { ok: false, reason: `it names ${spoilers.join(", ")}` } : read;
};
