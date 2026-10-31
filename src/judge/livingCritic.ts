import {
  CRITIC_MAX_FACTS, DIRECTOR_CRITIC_CONTRADICTS_MAX, DIRECTOR_CRITIC_FOLLOWS_MIN, DIRECTOR_CRITIC_NEW_PERSON_MAX, DIRECTOR_CRITIC_OUTCOME_MAX,
  DIRECTOR_CRITIC_PLAYER_ACT_MAX,
} from "./policy";
import { noul, noulAnswer } from "./questions";
import type { JudgeAnswer, JudgeRequest } from "./types";

export interface DirectorCriticInput {
  player: string;
  cast: string[];
  frontier: string;
  facts: string[];
  threads: string[];
  name: string;
  objective: string;
}

export interface DirectorCriticRead {
  playerAct: number;
  contradicts: number;
  outcomeName: number;
  newPerson: number;
  followsThread: number;
}

export const DIRECTOR_CRITIC_KEYS = ["playerAct", "contradicts", "outcomeName", "newPerson", "followsThread"] as const;

export const canonFacts = (canon: string): string[] =>
  canon.split(/\r?\n/).map((line) => line.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, "").trim()).filter((line) => line && !/^[A-Z][A-Z ]+:?$/.test(line)).slice(0, CRITIC_MAX_FACTS);

export function buildDirectorCriticRequest(input: DirectorCriticInput): JudgeRequest {
  const cast = [...new Set([input.player, ...input.cast].filter(Boolean))];
  return {
    state: {
      player: input.player,
      cast,
      current_scene: input.frontier,
      established_facts: input.facts.slice(0, CRITIC_MAX_FACTS),
      open_threads: input.threads,
      next_scene: { name: input.name, objective: input.objective },
    },
    questions: {
      playerAct: noul(
        "Does `next_scene.objective` decide or narrate what `player` does, says, chooses or feels?",
        { true: "The objective has the player act, speak, agree, refuse, choose, go somewhere or feel something", false: "Only the world, other characters or events act; the player's response is left open" },
      ),
      contradicts: noul(
        "Does `next_scene` contradict one of `established_facts`?",
        { true: "The scene shows something an established fact rules out", false: "The scene is compatible with every established fact" },
      ),
      outcomeName: noul(
        "Does `next_scene.name` state how the scene ends?",
        { true: "The name gives away the outcome: who wins, what is found, how it resolves", false: "The name names a place, a person or a situation" },
      ),
      newPerson: noul(
        "Does `next_scene` bring in a named person who is neither in `cast` nor in `established_facts`?",
        { true: "A new named person appears", false: "Only cast members, people the facts establish, or unnamed people appear" },
      ),
      followsThread: noul(
        "Does `next_scene` follow from `current_scene` or one of `open_threads`?",
        { true: "The scene continues the current scene or an open thread", false: "The scene ignores where the story is and starts something unrelated" },
      ),
    },
  };
}

export function readDirectorCritic(answers: Record<string, JudgeAnswer>): DirectorCriticRead | null {
  const values = DIRECTOR_CRITIC_KEYS.map((key) => noulAnswer(answers, key));
  if (values.some((value) => value === null)) return null;
  const [playerAct, contradicts, outcomeName, newPerson, followsThread] = values as number[];
  return { playerAct, contradicts, outcomeName, newPerson, followsThread };
}

export function directorCriticVerdict(read: DirectorCriticRead): { pass: boolean; issues: string[] } {
  const issues = [
    ...(read.playerAct >= DIRECTOR_CRITIC_PLAYER_ACT_MAX ? [`The objective decides what the player does, says, chooses or feels (judge p ${read.playerAct}); write only what the world and the cast do.`] : []),
    ...(read.contradicts >= DIRECTOR_CRITIC_CONTRADICTS_MAX ? [`It contradicts an established fact (judge p ${read.contradicts}).`] : []),
    ...(read.outcomeName >= DIRECTOR_CRITIC_OUTCOME_MAX ? [`The name states how the scene ends (judge p ${read.outcomeName}); name a place or situation.`] : []),
    ...(read.newPerson >= DIRECTOR_CRITIC_NEW_PERSON_MAX ? [`It brings in a named person outside the cast and the canon (judge p ${read.newPerson}).`] : []),
    ...(read.followsThread < DIRECTOR_CRITIC_FOLLOWS_MIN ? [`It does not follow from the current scene or an open thread (judge p ${read.followsThread}).`] : []),
  ];
  return { pass: issues.length === 0, issues };
}
