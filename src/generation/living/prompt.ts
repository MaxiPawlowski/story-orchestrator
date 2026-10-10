import { renderAgencyPolicy, DEFAULT_AGENCY, LIVING_MAX_NAME_CHARS, LIVING_MAX_OBJECTIVE_CHARS, type PrimitiveValue, type TensionLevel } from "@engine/index";
import { LIVING_MAX_RUBRIC_CHARS, wordsFor } from "./parse";

export const LENGTH_LIMITS = `- Length limits, each one enforced (an answer over any of them is refused): `
  + `name at most ${LIVING_MAX_NAME_CHARS} characters (two to six words); `
  + `objective at most ${LIVING_MAX_OBJECTIVE_CHARS} characters (about ${wordsFor(LIVING_MAX_OBJECTIVE_CHARS)} words, one or two sentences); `
  + `each rubric at most ${LIVING_MAX_RUBRIC_CHARS} characters (one short question). Count before you answer; shorter is better.`;
import { LIVING_MAX_NEW_QUALITIES } from "./types";

export interface DirectorQualityLine {
  key: string;
  type: string;
  values?: string[];
  rubric: string;
  value?: PrimitiveValue;
  latched?: boolean;
}

export interface DirectorInput {
  title: string;
  premise: string;
  tone?: string;
  playerRole?: string;
  cast: Array<{ name: string; role?: string; drive?: string }>;
  path: string[];
  frontier: { id: string; name: string; objective: string };
  canon: string;
  openThreads: string[];
  resolvedThreads: string[];
  plans: string[];
  refused: string | null;
  qualities: DirectorQualityLine[];
  tension: { suggested: TensionLevel; current: TensionLevel | null };
  chapter: { number: number; anchorsIn: number; size: [number, number]; mayClose: boolean };
  ending: { finalAllowed: boolean; finalRequired: boolean };
  retry?: string[];
}

const PATH_SHOWN = 8;
const THREADS_SHOWN = 10;

const qualityLine = (line: DirectorQualityLine): string => {
  const values = line.values?.length ? ` values=${line.values.join("|")}` : "";
  const now = line.value === undefined ? "unset" : JSON.stringify(line.value);
  return `${line.key}: ${line.type}${values}, now ${now}${line.latched ? " (locked)" : ""} — ${line.rubric}`;
};

const list = (title: string, rows: readonly string[], empty = "(none)"): string => `${title}:\n${rows.length ? rows.map((row) => `- ${row}`).join("\n") : empty}`;

export function renderDirectorPrompt(input: DirectorInput): string {
  const cast = input.cast.map((member) => `${member.name}${member.role ? ` (${member.role})` : ""}${member.drive ? ` — wants: ${member.drive}` : ""}`);
  const chapterLine = input.chapter.mayClose
    ? `This is chapter ${input.chapter.number}, with ${input.chapter.anchorsIn} turning point(s) written. A chapter holds ${input.chapter.size[0]} to ${input.chapter.size[1]}: `
      + `you may close it by setting "new_chapter": true and giving the next chapter a short "chapter_title".`
    : `This is chapter ${input.chapter.number}, with ${input.chapter.anchorsIn} turning point(s) written. Keep "new_chapter" false.`;
  const ending = input.ending.finalRequired
    ? `The story's ending condition holds: this turning point is the ending. Set "final": true.`
    : input.ending.finalAllowed
      ? `You may make this turning point the story's ending ("final": true) only when the threads above are resolved; otherwise false.`
      : `This story has no ending yet: "final" is false.`;
  return [
    `You direct a story that is written ahead of the player, one turning point at a time. Write the NEXT turning point only.`,
    `Story: ${input.title}`,
    `Premise: ${input.premise}`,
    ...(input.tone ? [`Tone: ${input.tone}`] : []),
    ...(input.playerRole ? [`The player is: ${input.playerRole}`] : []),
    list("Cast (use only these people, or people the canon establishes)", cast),
    list("Turning points reached so far, oldest first", input.path.slice(-PATH_SHOWN)),
    `The current turning point (the new one follows it): "${input.frontier.name}" — ${input.frontier.objective}`,
    `Canon:\n${input.canon.trim() || "(none yet)"}`,
    list("Threads the player has opened and is still pursuing (build on one of these first)", input.openThreads.slice(-THREADS_SHOWN)),
    list("Threads resolved recently", input.resolvedThreads.slice(-THREADS_SHOWN)),
    list("Private plans of the cast (they may shape what the world does; never name or reveal them in what you write)", input.plans),
    ...(input.refused ? [`The player refused the prepared route at "${input.refused}". Do not bring it back; let the world answer the refusal instead.`] : []),
    list("Story values (reuse these before declaring new ones)", input.qualities.map(qualityLine)),
    `Tension: now ${input.tension.current ?? "unknown"}; the story's shape asks for about ${input.tension.suggested} next.`,
    chapterLine,
    ending,
    `Rules:`,
    `- The objective is world pressure: what the world, a character or an event does or demands. Never decide, narrate or assume what the player says, chooses, feels or does.`,
    `- Build on what the player actually pursued, above all the open threads; a refusal is something the world answers, not a road to force again.`,
    `- The name is a short scene heading of two to six words (at most ${LIVING_MAX_NAME_CHARS} characters) that names a place or situation, never an outcome.`,
    `- The objective is one or two sentences (at most ${LIVING_MAX_OBJECTIVE_CHARS} characters).`,
    LENGTH_LIMITS,
    `- "opens_when" says what must happen in play before the story heads there. It must NOT already be true now, and play must be able to make it true.`,
    `  Either reuse a story value: {"reuse":{"q":"<key>","op":"==|!=|>=|<=|>|<|in","v":<literal>}} (only keys listed above with a reader that is not locked against it),`,
    `  or declare one new yes/no value: {"new":{"key":"short_snake_key","rubric":"Did <something observable> happen?"}}.`,
    `- Declare at most ${LIVING_MAX_NEW_QUALITIES} new values in total, counting "opens_when". "snapshot" may set values the new turning point assumes on arrival.`,
    `- Never put anything private (a character's hidden plan or secret) in the name, the objective or a rubric.`,
    `Agency policy:\n${renderAgencyPolicy(DEFAULT_AGENCY)}`,
    ...(input.retry?.length ? [`Your previous answer was refused: ${input.retry.join("; ")}. Fix exactly that.`] : []),
    `Return exact JSON only:`,
    `{"name":"...","objective":"...","tension":"calm|stirring|tense|critical|peak","snapshot":{},"opens_when":{"new":{"key":"...","rubric":"..."}},`
      + `"new_qualities":[],"builds_on":"<the thread you build on, or null>","new_chapter":false,"chapter_title":null,"final":false,"reason":"<one sentence, for the author>"}`,
  ].join("\n");
}

export interface DirectorCriticInput {
  premise: string;
  canon: string;
  frontier: string;
  name: string;
  objective: string;
  player: string;
  cast: string[];
}

export function renderDirectorCriticPrompt(input: DirectorCriticInput): string {
  return [
    `Review one generated turning point of a story written ahead of the player.`,
    `Premise: ${input.premise}`,
    `Canon:\n${input.canon.trim() || "(none)"}`,
    `It follows: ${input.frontier}`,
    `The player: ${input.player}. The cast: ${input.cast.join(", ") || "(none named)"}.`,
    `Name: ${input.name}`,
    `Objective: ${input.objective}`,
    `What the cast and the world do is expected and allowed, and so is a scene that has moved on since the earlier turning point.`,
    `Fail it only when the objective narrates or decides what ${input.player} does, says, chooses or feels (accepting, agreeing, refusing, choosing, going somewhere, `
      + `feeling), when it directly contradicts a line of the canon, or when the name states how the turning point ends.`,
    `Return exact JSON: {"pass":true|false,"issues":["..."]}`,
  ].join("\n");
}

export interface BranchContext {
  recent: string[];
  exits: string[];
  convergeTo: { name: string; objective: string };
  why: string;
  prepared?: boolean;
}

export function renderBranchPrompt(input: DirectorInput, branch: BranchContext): string {
  const cast = input.cast.map((member) => `${member.name}${member.role ? ` (${member.role})` : ""}`);
  return [
    branch.prepared
      ? `You direct a story that follows the player. Write one more way forward from the current turning point, one the player might take instead of the prepared ones.`
      : `You direct a story that follows the player. The player has gone off the prepared ways forward; write a short branch that follows what they are actually doing.`,
    `Story: ${input.title}`,
    `Premise: ${input.premise}`,
    ...(input.tone ? [`Tone: ${input.tone}`] : []),
    list("Cast (use only these people, or people the canon establishes)", cast),
    `The current turning point: "${input.frontier.name}" — ${input.frontier.objective}`,
    list(branch.prepared ? "The prepared ways forward (yours must differ from every one of them)" : "The prepared ways forward the player is NOT taking", branch.exits),
    `Why this is a branch: ${branch.why}`,
    list("The latest messages, oldest first", branch.recent),
    `Canon:\n${input.canon.trim() || "(none yet)"}`,
    list("Private plans of the cast (they may shape what the world does; never name or reveal them)", input.plans),
    `The branch must come back, in its own time, to: "${branch.convergeTo.name}" — ${branch.convergeTo.objective}`,
    `Rules:`,
    `- Name the situation the player is pursuing (two to six words, at most ${LIVING_MAX_NAME_CHARS} characters), as a scene heading, never an outcome.`,
    `- The objective (at most ${LIVING_MAX_OBJECTIVE_CHARS} characters) says how the world answers what the player is doing and how it can lead back toward `
      + `the turning point above. It is world pressure: never decide, narrate or assume what the player says, chooses, feels or does next.`,
    `- "opens_when" declares one new yes/no value whose rubric asks whether the player is pursuing this, in words a reader of the chat can check: `
      + `{"new":{"key":"short_snake_key","rubric":"Is the player ...?"}}.`,
    `- Never put anything private (a character's hidden plan or secret) in the name, the objective or the rubric.`,
    LENGTH_LIMITS,
    `Agency policy:\n${renderAgencyPolicy(DEFAULT_AGENCY)}`,
    ...(input.retry?.length ? [`Your previous answer was refused: ${input.retry.join("; ")}. Fix exactly that.`] : []),
    `Return exact JSON only: {"name":"...","objective":"...","tension":"calm|stirring|tense|critical|peak",`
      + `"opens_when":{"new":{"key":"...","rubric":"..."}},"reason":"<one sentence, for the author>"}`,
  ].join("\n");
}
