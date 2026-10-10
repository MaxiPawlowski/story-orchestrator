import { nearestKey } from "@utils/levenshtein";
import type { GuideTopicId } from "../guideTopics";
import type { DIAGNOSTIC_CODES } from "../../studio/diagnosticCodes";
import type { AGENT_TOOLS } from "./tools";

type ToolName = keyof typeof AGENT_TOOLS;
type DiagnosticCode = (typeof DIAGNOSTIC_CODES)[number];

export interface RecipeStep {
  tool: ToolName;
  does: string;
  optional?: boolean;
}

export interface RecipeTrap {
  topic: GuideTopicId;
  cue: string;
  text: string;
}

export interface Recipe {
  title: string;
  when: string;
  topics: readonly GuideTopicId[];
  steps: readonly RecipeStep[];
  verify: readonly ToolName[];
  diagnostics: readonly DiagnosticCode[];
  traps: readonly RecipeTrap[];
}

const VERIFY: readonly ToolName[] = ["readValidation", "readDiagnostics"];

export const RECIPES = {
  "quest-line": {
    title: "Add a quest line",
    when: "the author wants a side quest (or a chain of them) with steps, an ending and a reward",
    topics: ["quests", "qualities", "gates", "widgets"],
    steps: [
      { tool: "readGuide", does: "read the quests topic" },
      { tool: "readStory", does: "see the qualities and beats the quest can lean on" },
      { tool: "addQuality", does: "one extractor bool per thing the player does (met the giver, found it, brought it back), each with a rubric" },
      { tool: "setQuests", does: "the full quest list: visible_when (the acceptance), steps with done_when, an optional failed_when and reward" },
      { tool: "setMilestones", does: "a milestone for the moment worth marking; secret if it spoils", optional: true },
      { tool: "setWidgets", does: "a track bound to \"quests\" if the Journal should show the line", optional: true },
      { tool: "simulateWalk", does: "set the step qualities in order and check the quest reaches done", optional: true },
    ],
    verify: [...VERIFY, "simulateWalk"],
    diagnostics: ["undeclared-quality", "enum-value-invalid"],
    traps: [
      { topic: "quests", cue: "A reward on a quest that is done before anything happens", text: "a quest that is done at the start is refused, and so is its reward" },
      { topic: "quests", cue: "an offered quest that fails on time alone", text: "an offered quest never fails; do not fail it on time alone" },
      { topic: "quests", cue: "a step title that names a later beat", text: "titles and steps are player copy: never name a later beat" },
    ],
  },
  "character-life": {
    title: "Give a character an agenda, relationships or a mood",
    when: "the author wants a cast member to feel, want or be somewhere on their own",
    topics: ["character-life", "roster", "gates", "chapters"],
    steps: [
      { tool: "readGuide", does: "read the character-life topic" },
      { tool: "readStory", does: "find the member's roster id and the qualities the agenda can wait on" },
      { tool: "addRosterMember", does: "only if the character is not in the cast yet", optional: true },
      { tool: "setCharacterLife", does: "the member's whole life: relationships toward ids or player, mood with a baseline, agenda steps, schedule" },
      { tool: "setClock", does: "times of day, when a schedule or a step waits on time_of_day", optional: true },
    ],
    verify: VERIFY,
    diagnostics: ["agenda-pace-no-chapters", "undeclared-quality"],
    traps: [
      { topic: "character-life", cue: "`display` on a `rel_*` quality", text: "feelings are never public: no display on a rel_* quality" },
      { topic: "character-life", cue: "an agenda step with `cast_changes`", text: "an agenda step never changes the cast; use a checkpoint" },
      { topic: "character-life", cue: "`pace: \"per_chapter\"` in a story without `chapters`", text: "per_chapter needs chapters; otherwise use per_n_boundaries with every" },
    ],
  },
  "clue-wall-or-map": {
    title: "Add a clue wall or a map",
    when: "the author wants the player to see clues found so far, or a map with pins",
    topics: ["clues-and-maps", "widgets", "qualities"],
    steps: [
      { tool: "readGuide", does: "read the clues-and-maps topic" },
      { tool: "readStory", does: "see which qualities already mark a clue or a place" },
      { tool: "addQuality", does: "a bool per clue the reader can notice, if none marks it yet", optional: true },
      { tool: "lookupBackgrounds", does: "a map's image is an installed background file name", optional: true },
      { tool: "setWidgets", does: "the full panel list with a clues panel (clues, links) or a map panel (image, pins)" },
    ],
    verify: VERIFY,
    diagnostics: ["widget-item-never-read", "map-pin-unreachable", "map-image-missing"],
    traps: [
      { topic: "clues-and-maps", cue: "A clue gated on a quality nothing else reads", text: "gate a clue on a quality the story already reads, or it never shows" },
      { topic: "clues-and-maps", cue: "a pin on a checkpoint no path reaches", text: "pin only checkpoints a path reaches" },
      { topic: "clues-and-maps", cue: "a clue's `text` that names a secret", text: "a clue's text shows the moment it is found: write what the player sees" },
    ],
  },
  chapters: {
    title: "Add chapters",
    when: "the author wants the story split into acts with written-up records",
    topics: ["chapters", "checkpoints"],
    steps: [
      { tool: "readGuide", does: "read the chapters topic" },
      { tool: "readGraph", does: "see the order beats are reached in, to cut acts at real turning points" },
      { tool: "setChapters", does: "the full chapter list in play order, every checkpoint assigned, the last one final" },
    ],
    verify: [...VERIFY, "simulateReachability"],
    diagnostics: ["chapter-missing", "chapter-unknown", "chapter-unreachable", "chapter-no-exit", "chapter-reentry", "story-dead-end"],
    traps: [
      { topic: "chapters", cue: "a transition back into an earlier chapter", text: "never lead back into an earlier chapter: it reopens a closed record" },
      { topic: "chapters", cue: "A beat without a chapter", text: "once one chapter exists every beat names one" },
      { topic: "chapters", cue: "a non-final chapter with no way out", text: "every chapter but the final one needs a way out" },
    ],
  },
  "lore-scope": {
    title: "Set up lore select and the curator's scope",
    when: "the story has lorebooks and the author wants the right entries picked each turn and some kept current by the curator",
    topics: ["lore-select", "stagecraft", "requirements", "world-info"],
    steps: [
      { tool: "readGuide", does: "read the lore-select and stagecraft topics" },
      { tool: "lookupLorebooks", does: "the books on this install, by exact name" },
      { tool: "readStory", does: "see which books beat lore already gates" },
      { tool: "setRequirements", does: "list every book lore select or the curator relies on" },
      { tool: "setLoreSelect", does: "the books whose entries are picked per turn, top_k, exclusive only if the author asks" },
      { tool: "setStagecraft", does: "the curator's books: never one beat lore gates" },
    ],
    verify: VERIFY,
    diagnostics: ["lore-select-inactive", "lore-select-exclusive-empty"],
    traps: [
      { topic: "lore-select", cue: "A book that is not required.", text: "a lore-select book must also be required" },
      { topic: "stagecraft", cue: "A curator book that beat lore also gates", text: "a curator book is never one beat lore gates" },
      { topic: "stagecraft", cue: "a style or rules entry left open to curator rewrites", text: "protect style and rules entries from curator rewrites" },
    ],
  },
  "group-ready": {
    title: "Make a story group-ready",
    when: "the story should run in a group chat with its cast, or Repair says a member or the group is missing",
    topics: ["requirements", "roster", "cast-changes", "talk-control", "opening-scene"],
    steps: [
      { tool: "readGuide", does: "read the requirements and opening-scene topics" },
      { tool: "readStory", does: "the cast with ids and card names" },
      { tool: "lookupCharacters", does: "which cards exist, by exact name" },
      { tool: "updateRosterMember", does: "a card name and a one-line role on every member", optional: true },
      { tool: "setRequirements", does: "members as card names exactly as SillyTavern lists them, never roster ids" },
      { tool: "createCharacterCard", does: "only a card that does not exist; the author confirms it", optional: true },
      { tool: "lookupGroups", does: "whether a group for this story exists", optional: true },
      { tool: "createGroup", does: "a group of exactly the story's cast; the author confirms it", optional: true },
    ],
    verify: VERIFY,
    diagnostics: ["requirement-member-roster-id", "cast-member-no-card", "talk-member-unknown", "roster-member-is-player"],
    traps: [
      { topic: "requirements", cue: "roster ids instead of card names", text: "requirements name cards, never roster ids" },
      { topic: "opening-scene", cue: "Every member greeted at once in a fresh group", text: "every card with a first message greets at once: only characters present at the start get one" },
      { topic: "talk-control", cue: "A `lead` left out of `speakers`", text: "list the lead in speakers" },
    ],
  },
} as const satisfies Record<string, Recipe>;

export type RecipeId = keyof typeof RECIPES;

export const RECIPE_IDS = Object.keys(RECIPES) as RecipeId[];

const isRecipe = (value: string): value is RecipeId => Object.hasOwn(RECIPES, value);

export const renderRecipe = (id: RecipeId): string => {
  const recipe: Recipe = RECIPES[id];
  const steps = recipe.steps.map((step, index) => `${index + 1}. ${step.tool}${step.optional ? " (if needed)" : ""}: ${step.does}`);
  return [
    `Recipe ${id}: ${recipe.title}. Use when ${recipe.when}.`,
    `Guide topics: ${recipe.topics.join(", ")}.`,
    "Steps:", ...steps,
    `Then check: ${recipe.verify.join(", ")}; fix any of ${recipe.diagnostics.join(", ")}.`,
    "Traps:", ...recipe.traps.map((trap) => `- ${trap.text} (${trap.topic})`),
  ].join("\n");
};

export const recipeIndex = (): string => RECIPE_IDS.map((id) => `${id} (${RECIPES[id].title})`).join(", ");

export const readRecipe = (recipe: unknown): string => {
  const typed = typeof recipe === "string" ? recipe.trim().toLowerCase() : "";
  if (isRecipe(typed)) return renderRecipe(typed);
  const near = typed ? nearestKey(typed, RECIPE_IDS) : null;
  const known = `Recipes: ${recipeIndex()}.`;
  if (!typed) return `Name a recipe. ${known}`;
  return `No recipe "${typed}"${near ? ` (did you mean "${near}"?)` : ""}. ${known}`;
};
