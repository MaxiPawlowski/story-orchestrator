import { PLAYER_ACTION_CLAUSE } from "@engine/index";
import { buildContinuityRequest, continuityNote } from "./curators";
import { AGENCY_SCORE, CONTINUITY_MAX_FACTS, HOUSE_RULE_MAX_NOTE, HOUSE_RULE_P, WARDEN_ARM, WARDEN_MAX_RULES, type WardenArm } from "./policy";
import { noul, noulAnswer, score, scoreAnswer } from "./questions";
import type { JudgeAnswer, JudgeRequest } from "./types";

export const WARDEN_FAMILIES = ["continuity", "agency", "house-rule"] as const;
export type WardenFamily = (typeof WARDEN_FAMILIES)[number];

export interface WardenInput {
  reply: { speaker: string; text: string };
  facts: string[];
  agency: { player: string; message: string } | null;
  houseRules: string[];
}

export interface WardenFinding {
  family: WardenFamily;
  text: string;
  facts: string[];
  rules?: string[];
  score?: number;
}

export const AGENCY_QUESTION = "Does `reply` write what only `player` does, says, decides or thinks? `player_message` is what the player wrote themselves.";

export const AGENCY_LEVELS = [
  "world, NPCs and perception only: the reply writes nothing the player does, says, decides or thinks",
  "restates the player's own message: it narrates only what `player_message` already says the player did or said, or the world's answer to it",
  "a small reflexive reaction attributed to the player: a flinch, a blink, a shiver or a caught breath, with no choice in it",
  "a new player action or new player words: the player moves, acts or speaks beyond what `player_message` says",
  "a player decision, concession or dialogue: the reply decides for the player, has them agree, refuse, give in or answer in their own words",
] as const;

export const HOUSE_RULE_CRITERIA = {
  true: "The reply does what the rule forbids or breaks the constraint it states, in its narration or in a character's words",
  false: "The reply follows the rule or does not touch it",
} as const;

export const agencyNoteText = (player: string): string => {
  const name = player.trim();
  const clause = name ? PLAYER_ACTION_CLAUSE.replace("The player's", `${name}'s`).replace(/the player/g, name) : PLAYER_ACTION_CLAUSE;
  return `Agency: ${clause}`;
};

export const houseRuleNoteLine = (rule: string): string => `House rule: "${rule}" — keep the next reply within it.`;

const keptRules = (rules: string[]) => rules.slice(0, WARDEN_MAX_RULES);

const agencyPart = (input: WardenInput): Pick<JudgeRequest, "state" | "questions"> | null =>
  input.agency
    ? { state: { player: input.agency.player, player_message: input.agency.message }, questions: { agency: score(AGENCY_QUESTION, [...AGENCY_LEVELS]) } }
    : null;

const rulesPart = (input: WardenInput): Pick<JudgeRequest, "state" | "questions"> | null => {
  const rules = keptRules(input.houseRules);
  if (!rules.length) return null;
  return {
    state: { house_rules: Object.fromEntries(rules.map((rule, index) => [`rule_${index}`, rule])) },
    questions: Object.fromEntries(rules.map((_, index) => [`rule:${index}`, noul(`Does \`reply\` break \`house_rules.rule_${index}\`?`, { ...HOUSE_RULE_CRITERIA })])),
  };
};

export function buildWardenRequests(input: WardenInput, arm: WardenArm = WARDEN_ARM): JudgeRequest[] {
  const continuity = input.facts.length ? buildContinuityRequest(input.reply, input.facts) : null;
  const parts = [agencyPart(input), rulesPart(input)].filter((part): part is Pick<JudgeRequest, "state" | "questions"> => part !== null);
  if (arm === "separate") return [...(continuity ? [continuity] : []), ...parts.map((part) => ({ state: { reply: input.reply, ...part.state }, questions: part.questions }))];
  if (!continuity && !parts.length) return [];
  const base = continuity ?? { state: { reply: input.reply }, questions: {} };
  return [parts.reduce<JudgeRequest>((request, part) => ({ state: { ...request.state, ...part.state }, questions: { ...request.questions, ...part.questions } }), base)];
}

export function readWarden(answers: Record<string, JudgeAnswer>, input: WardenInput): WardenFinding[] {
  const findings: WardenFinding[] = [];
  const continuity = input.facts.length ? continuityNote(answers, input.facts) : null;
  if (continuity) findings.push({ family: "continuity", text: continuity.text, facts: continuity.facts });
  const agency = input.agency ? scoreAnswer(answers, "agency") : null;
  if (input.agency && agency && agency.score > AGENCY_SCORE) findings.push({ family: "agency", text: agencyNoteText(input.agency.player), facts: [], score: agency.score });
  const broken = keptRules(input.houseRules)
    .map((rule, index) => ({ rule, p: noulAnswer(answers, `rule:${index}`) ?? 0 }))
    .filter((entry) => entry.p >= HOUSE_RULE_P)
    .sort((left, right) => right.p - left.p)
    .slice(0, HOUSE_RULE_MAX_NOTE)
    .map((entry) => entry.rule);
  if (broken.length) findings.push({ family: "house-rule", text: broken.map(houseRuleNoteLine).join("\n"), facts: [], rules: broken });
  return findings;
}

export const wardenFamiliesAsked = (input: WardenInput): WardenFamily[] => [
  ...(input.facts.length ? ["continuity" as const] : []),
  ...(input.agency ? ["agency" as const] : []),
  ...(keptRules(input.houseRules).length ? ["house-rule" as const] : []),
];

export const wardenRecordP = (answers: Record<string, JudgeAnswer> | null, input: WardenInput): Record<string, number> => {
  const findings = answers ? readWarden(answers, input) : [];
  const agency = answers && input.agency ? scoreAnswer(answers, "agency") : null;
  return {
    facts: Math.min(input.facts.length, CONTINUITY_MAX_FACTS),
    flagged: findings.find((finding) => finding.family === "continuity")?.facts.length ?? 0,
    ...(input.agency ? { agency: agency ? Number(agency.score.toFixed(3)) : -1 } : {}),
    ...(keptRules(input.houseRules).length ? { rules: keptRules(input.houseRules).length, broken: findings.find((finding) => finding.family === "house-rule")?.rules?.length ?? 0 } : {}),
  };
};
