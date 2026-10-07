import { choice, choiceAnswer } from "@judge/questions";
import type { JudgeAnswer, JudgeRequest } from "@judge/types";
import type { SpriteLabel } from "./profile";

export const NARRATION = "narration";

export type ExpressionSource = "judge" | "llm" | "local" | "speaker";

export interface ExpressionInput {
  speaker: string;
  cast: string[];
  labels: Record<string, SpriteLabel>;
  localMap: Record<string, string>;
  fallbackLabel: string;
  segments: Array<{ index: number; text: string }>;
}

export interface ExpressionRead {
  index: number;
  who: string;
  face: string;
  source: ExpressionSource;
}

export interface ExpressionStep {
  step: Exclude<ExpressionSource, "speaker">;
  ms: number;
  ok: boolean;
}

export interface ExpressionDeps {
  judge: ((request: JudgeRequest) => Promise<Record<string, JudgeAnswer> | null>) | null;
  llm: ((system: string, user: string, grammar: string) => Promise<string>) | null;
  local: ((text: string) => Promise<Array<{ label: string; score: number }>>) | null;
  warn?: (step: ExpressionSource, error: unknown) => void;
  step?: (entry: ExpressionStep) => void;
  now?: () => number;
}

async function timed<T>(deps: ExpressionDeps, step: ExpressionStep["step"], run: () => Promise<T | null>): Promise<T | null> {
  const now = deps.now ?? (() => Date.now());
  const started = now();
  try {
    const value = await run();
    deps.step?.({ step, ms: now() - started, ok: value !== null });
    return value;
  } catch (error) {
    deps.step?.({ step, ms: now() - started, ok: false });
    deps.warn?.(step, error);
    return null;
  }
}

const asksWho = (input: ExpressionInput) => input.cast.length > 1 || !input.cast.includes(input.speaker);

export function buildExpressionRequest(input: ExpressionInput): JudgeRequest {
  const state: Record<string, unknown> = {
    speaker: input.speaker,
    characters: input.cast,
    passages: Object.fromEntries(input.segments.map((segment) => [`p${segment.index}`, segment.text])),
  };
  const questions: JudgeRequest["questions"] = {};
  const faces = Object.fromEntries(Object.entries(input.labels).map(([id, label]) => [id, {
    what: label.what,
    ...(label.notFor ? { not_for: label.notFor } : {}),
    ...(label.examples.length ? { examples: label.examples } : {}),
  }]));
  for (const segment of input.segments) {
    const id = `p${segment.index}`;
    if (asksWho(input)) {
      questions[`who:${segment.index}`] = choice(`Which of \`characters\` is the passage \`passages.${id}\` mostly about: who acts, speaks or reacts in it?`, {
        ...Object.fromEntries(input.cast.map((name) => [name, null])),
        [NARRATION]: "None of the characters: scenery, the player, or someone not listed",
      });
    }
    questions[`face:${segment.index}`] = choice(`What facial expression does the main character of \`passages.${id}\` show in that passage?`, faces);
  }
  return { state, questions };
}

export function readExpressionAnswers(answers: Record<string, JudgeAnswer>, input: ExpressionInput): ExpressionRead[] {
  return input.segments.map((segment) => {
    const who = asksWho(input) ? choiceAnswer(answers, `who:${segment.index}`)?.choice ?? input.speaker : input.speaker;
    const face = choiceAnswer(answers, `face:${segment.index}`)?.choice;
    return { index: segment.index, who, face: face && input.labels[face] ? face : input.fallbackLabel, source: "judge" as const };
  });
}

const literal = (value: string) => JSON.stringify(value);

export function expressionGrammar(input: ExpressionInput): string {
  const who = [...input.cast, NARRATION].map(literal).join(" | ");
  const face = Object.keys(input.labels).map(literal).join(" | ");
  return `root ::= line+\nline ::= [0-9]+ "|" who "|" face "\\n"\nwho ::= ${who}\nface ::= ${face}\n`;
}

export function expressionPrompt(input: ExpressionInput): { system: string; user: string } {
  const labels = Object.entries(input.labels).map(([id, label]) => `- ${id}: ${label.what}${label.notFor ? ` (not for ${label.notFor})` : ""}`).join("\n");
  const system = [
    "You label the facial expression of a character in each numbered passage of a roleplay reply.",
    `Characters: ${input.cast.join(", ")}. Use ${NARRATION} when a passage is about none of them.`,
    "Expressions:",
    labels,
    "Answer one line per passage, in order, exactly: number|character|expression",
  ].join("\n");
  const user = [`The reply is written by ${input.speaker}.`, ...input.segments.map((segment) => `${segment.index}. ${segment.text}`)].join("\n\n");
  return { system, user };
}

export function parseExpressionLines(text: string, input: ExpressionInput): ExpressionRead[] | null {
  const byIndex = new Map<number, ExpressionRead>();
  for (const line of text.split(/\r?\n/)) {
    const match = /^\s*(\d+)\s*[|.:)-]\s*([^|]+?)\s*\|\s*([a-z_]+)\s*$/i.exec(line);
    if (!match) continue;
    const index = Number(match[1]);
    const name = input.cast.find((member) => member.toLowerCase() === match[2].toLowerCase());
    const face = match[3].toLowerCase();
    byIndex.set(index, { index, who: name ?? (match[2].toLowerCase() === NARRATION ? NARRATION : input.speaker), face: input.labels[face] ? face : input.fallbackLabel, source: "llm" });
  }
  const reads = input.segments.map((segment) => byIndex.get(segment.index));
  return reads.every(Boolean) ? (reads as ExpressionRead[]) : null;
}

export function localLabel(scores: Array<{ label: string; score: number }>, input: ExpressionInput): string {
  for (const entry of [...scores].sort((a, b) => b.score - a.score)) {
    const mapped = input.localMap[entry.label];
    if (mapped && input.labels[mapped]) return mapped;
  }
  return input.fallbackLabel;
}

export async function classifyExpressions(input: ExpressionInput, deps: ExpressionDeps): Promise<ExpressionRead[]> {
  if (!input.segments.length) return [];
  const { judge, llm, local } = deps;
  if (judge) {
    const answers = await timed(deps, "judge", () => judge(buildExpressionRequest(input)));
    if (answers) return readExpressionAnswers(answers, input);
  }
  if (llm) {
    const { system, user } = expressionPrompt(input);
    const parsed = await timed(deps, "llm", async () => parseExpressionLines(await llm(system, user, expressionGrammar(input)), input));
    if (parsed) return parsed;
  }
  if (local) {
    const reads = await timed(deps, "local", () => Promise.all(input.segments.map(async (segment) => ({
      index: segment.index, who: input.speaker, face: localLabel(await local(segment.text), input), source: "local" as const,
    }))));
    if (reads) return reads;
  }
  return input.segments.map((segment) => ({ index: segment.index, who: input.speaker, face: input.fallbackLabel, source: "speaker" }));
}
