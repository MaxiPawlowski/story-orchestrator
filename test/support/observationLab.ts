import { StoryEngine } from "@engine/engine";
import type { NormalizedStory, PrimitiveValue } from "@engine/schema";
import { labRaw, labStory } from "./codexLab";
import { readFileSync } from "node:fs";
import { join } from "node:path";

export interface CorpusExpectation {
  noticed: number | null;
  missed: number | null;
}

export const OBSERVATION_CORPUS = JSON.parse(readFileSync(join(process.cwd(), "test/fixtures/observations-corpus.json"), "utf8")) as {
  chance: { chatId: string; storyId: string };
  observations: Array<Record<string, unknown> & { id: string; text: string }>;
  script: Array<Array<[string, PrimitiveValue]>>;
  expected: Record<string, CorpusExpectation>;
};

export const observationLabRaw = (patch: Record<string, unknown> = {}): Record<string, unknown> =>
  labRaw({ observations: OBSERVATION_CORPUS.observations, ...patch });

export const observationLabStory = (patch: Record<string, unknown> = {}): NormalizedStory => labStory({ observations: OBSERVATION_CORPUS.observations, ...patch });

export const corpusEngine = (story: NormalizedStory, chance: { chatId: string; storyId: string } | null = OBSERVATION_CORPUS.chance): StoryEngine => {
  const engine = new StoryEngine({ now: () => 0, chanceIds: () => chance });
  engine.loadStory(story);
  return engine;
};

export const messageOf = (boundary: number): number => boundary * 2;

export const playCorpus = (engine: StoryEngine, turns: number = OBSERVATION_CORPUS.script.length, from = 0): void => {
  OBSERVATION_CORPUS.script.slice(from, turns).forEach((deltas, index) => {
    const message = messageOf(from + index + 1);
    engine.enqueue({ source: "extractor", blackboardVersionSum: 0, turnRange: { from: message - 1, to: message },
      deltas: deltas.map(([q, v]) => ({ q, v, source: "extractor" as const })) });
    engine.commitBoundary({ lastMessageId: message, chatLength: message + 1 });
  });
};
