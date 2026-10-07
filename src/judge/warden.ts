import { PLAYER_ACTION_CLAUSE, PLAYER_REF } from "@engine/index";
import { buildContinuityRequest, continuityNote } from "./curators";
import {
  AGENCY_SCORE, ATTENTION_SCORE, VOICE_MAX_FEELINGS, VOICE_SCORE,
  CONTINUITY_MAX_FACTS, HOUSE_RULE_MAX_GROUP, HOUSE_RULE_MAX_NOTE, HOUSE_RULE_MESSAGE_CHARS, HOUSE_RULE_P, HOUSE_RULE_ROLE_CHARS, LORE_CONTENT_CHARS,
  WARDEN_ARM, WARDEN_LORE_MAX_NOTE, WARDEN_LORE_P, WARDEN_MAX_LORE, WARDEN_MAX_RULES, type WardenArm,
} from "./policy";
import { noul, noulAnswer, score, scoreAnswer } from "./questions";
import type { JudgeAnswer, JudgeRequest } from "./types";

export const WARDEN_FAMILIES = ["continuity", "agency", "attention", "voice", "house-rule"] as const;
export type WardenFamily = (typeof WARDEN_FAMILIES)[number];

export interface WardenInput {
  reply: { speaker: string; text: string };
  facts: string[];
  agency: { player: string; message: string } | null;
  attention?: { player: string; message: string };
  voice?: { speaker: string; role?: string; drive?: string; feelings: string[] };
  houseRules: string[];
  lore?: WardenLore[];
  houseRuleContext?: HouseRuleContext;
}

export interface WardenLore {
  comment: string;
  text: string;
}

export interface HouseRuleScene {
  player: string;
  playerMessage?: string;
  speakerRole?: string;
  groupMembers: string[];
}

export interface HouseRuleContext {
  scene: HouseRuleScene;
  worldBook: Array<WardenLore & { constant?: boolean }>;
}

export interface ParagraphLimit {
  min: number;
  max: number;
}

export interface WardenFinding {
  family: WardenFamily;
  text: string;
  facts: string[];
  rules?: string[];
  score?: number;
}

export interface WardenLoreFinding {
  family: "lore";
  text: string;
  lore: string[];
}

export const AGENCY_QUESTION = "Does `reply` write what only `player` does, says, decides or thinks? `player_message` is what the player wrote themselves.";

export const AGENCY_LEVELS = [
  "world, NPCs and perception only: the reply writes nothing the player does, says, decides or thinks",
  "restates the player's own message: it narrates only what `player_message` already says the player did or said, or the world's answer to it",
  "a small reflexive reaction attributed to the player: a flinch, a blink, a shiver or a caught breath, with no choice in it",
  "a new player action or new player words: the player moves, acts or speaks beyond what `player_message` says",
  "a player decision, concession or dialogue: the reply decides for the player, has them agree, refuse, give in or answer in their own words",
] as const;

export const ATTENTION_QUESTION =
  "Does `reply` answer what `player` just said, asked or did in `player_message`? A refusal, a dodge in character or a question back counts as an answer. " +
  "If `reply` is spoken by a character the player did not address, any reply that keeps the scene going counts as an answer.";

export const ATTENTION_LEVELS = [
  "ignores: the reply passes over what the player said, asked or did, as if it had not happened",
  "partial: the reply touches what the player said or did but leaves its main ask or action unanswered",
  "responds: the reply answers what the player said or did, refuses it, dodges it in character, or was not addressed to it",
] as const;

export const VOICE_QUESTION =
  "Does `reply` sound like `voice.speaker`, the character who speaks it, given their `voice.role`, `voice.drive` and `voice.feelings`? " +
  "A character may change their mind or hide a feeling; only speech or behaviour that no version of them would show counts against it.";

export const VOICE_LEVELS = [
  "out of character: the speaker talks or acts like someone else, against their role, drive or feelings",
  "drifting: mostly them, with a line or two that does not fit",
  "in character: it sounds like them, including a change of heart the scene explains",
] as const;

export const voiceNoteText = (speaker: string): string =>
  `Voice: the last reply did not sound like ${speaker.trim() || "its speaker"}. Let the next one come back to their own way of speaking and wanting.`;

export const attentionNoteText = (player: string): string => {
  const name = player.trim() || "the player";
  return `Attention: the last reply passed over what ${name} said or did. Let the next reply answer it before the scene moves on.`;
};

export const HOUSE_RULE_CRITERIA = {
  true: "The reply does what the rule forbids or breaks the constraint it states, in its narration or in a character's words",
  false: "The reply follows the rule or does not touch it",
} as const;

export const LORE_CRITERIA = {
  true: "The reply states or shows something the lore entry says is not so, in its narration or in a character's words",
  false: "The reply agrees with the lore entry or does not touch it",
} as const;

export const agencyNoteText = (player: string): string => {
  const name = player.trim();
  const clause = name ? PLAYER_ACTION_CLAUSE.split(PLAYER_REF).join(name) : PLAYER_ACTION_CLAUSE;
  return `Agency: ${clause}`;
};

export const houseRuleNoteLine = (rule: string): string => `House rule: "${rule}" — keep the next reply within it.`;

export const loreNoteLine = (entry: WardenLore): string => `Lore: "${entry.comment}" says ${entry.text} — keep the next reply consistent with it.`;

const keptRules = (rules: string[]) => rules.slice(0, WARDEN_MAX_RULES);

const NUMBER_WORDS = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve"];
const COUNT = `(\\d+|${NUMBER_WORDS.join("|")})`;
const PARAGRAPHS = "\\s+(?:[a-z-]+\\s+)?paragraphs?\\b";
const quantity = (word: string): number => (/^\d+$/.test(word) ? Number(word) : NUMBER_WORDS.indexOf(word));
const PARAGRAPH_LIMITS: Array<[RegExp, (first: number, second: number) => ParagraphLimit]> = [
  [new RegExp(`\\b${COUNT}\\s*(?:to|and|or|-|\u2013|\u2014)\\s*${COUNT}${PARAGRAPHS}`), (first, second) => ({ min: Math.min(first, second), max: Math.max(first, second) })],
  [new RegExp(`\\b(?:at most|up to|(?:no|not|never) more than|(?:a )?maximum of)\\s+${COUNT}${PARAGRAPHS}`), (first) => ({ min: 1, max: first })],
  [new RegExp(`\\b(?:at least|(?:no|not|never) (?:fewer|less) than|(?:a )?minimum of)\\s+${COUNT}${PARAGRAPHS}`), (first) => ({ min: first, max: Number.POSITIVE_INFINITY })],
  [new RegExp(`\\bexactly\\s+${COUNT}${PARAGRAPHS}`), (first) => ({ min: first, max: first })],
  [/\b(?:a|one) single\s+(?:[a-z-]+\s+)?paragraph\b/, () => ({ min: 1, max: 1 })],
];

export function paragraphLimit(rule: string): ParagraphLimit | null {
  const text = rule.toLowerCase();
  for (const [pattern, limit] of PARAGRAPH_LIMITS) {
    const match = pattern.exec(text);
    if (!match) continue;
    const found = limit(quantity(match[1] ?? "1"), quantity(match[2] ?? match[1] ?? "1"));
    return found.min >= 0 && found.max >= found.min ? found : null;
  }
  return null;
}

export function countParagraphs(text: string): number {
  const blocks = text.split(/\n\s*\n/).map((block) => block.trim()).filter(Boolean);
  return blocks.length > 1 ? blocks.length : text.split("\n").map((line) => line.trim()).filter(Boolean).length;
}

export const paragraphBreak = (rule: string, reply: string): boolean => {
  const limit = paragraphLimit(rule);
  if (!limit) return false;
  const count = countParagraphs(reply);
  return count < limit.min || count > limit.max;
};

export const houseRulesDecidedInCode = (input: WardenInput): boolean => keptRules(input.houseRules).some((rule) => paragraphBreak(rule, input.reply.text));

export const houseRuleP = (answers: Record<string, JudgeAnswer>, input: WardenInput, index: number): number | null => {
  const rule = keptRules(input.houseRules)[index];
  return rule !== undefined && paragraphBreak(rule, input.reply.text) ? 1 : noulAnswer(answers, `rule:${index}`);
};

export const houseRuleLore = (worldBook: HouseRuleContext["worldBook"] = []): WardenLore[] =>
  keptLore([...worldBook.filter((entry) => !entry.constant), ...worldBook.filter((entry) => entry.constant)]);

const sceneState = (scene: HouseRuleScene) => {
  const role = scene.speakerRole?.trim().slice(0, HOUSE_RULE_ROLE_CHARS);
  const message = scene.playerMessage?.trim().slice(0, HOUSE_RULE_MESSAGE_CHARS);
  const members = scene.groupMembers.map((name) => name.trim()).filter(Boolean).slice(0, HOUSE_RULE_MAX_GROUP);
  return {
    player: scene.player.trim(),
    ...(role ? { speaker_role: role } : {}),
    ...(members.length ? { group_members: members } : {}),
    ...(message ? { player_message: message } : {}),
  };
};

const withPlayer = (rule: string, player: string): string => (player ? rule.replace(/\{\{user\}\}/gi, player) : rule);

export const keptLore = (lore: WardenLore[] = []): WardenLore[] =>
  lore.slice(0, WARDEN_MAX_LORE).map((entry) => ({ comment: entry.comment, text: entry.text.slice(0, LORE_CONTENT_CHARS) }));

const agencyPart = (input: WardenInput): Pick<JudgeRequest, "state" | "questions"> | null =>
  input.agency
    ? { state: { player: input.agency.player, player_message: input.agency.message }, questions: { agency: score(AGENCY_QUESTION, [...AGENCY_LEVELS]) } }
    : null;

const attentionPart = (input: WardenInput): Pick<JudgeRequest, "state" | "questions"> | null =>
  input.attention
    ? { state: { player: input.attention.player, player_message: input.attention.message }, questions: { attention: score(ATTENTION_QUESTION, [...ATTENTION_LEVELS]) } }
    : null;

const voicePart = (input: WardenInput): Pick<JudgeRequest, "state" | "questions"> | null =>
  input.voice
    ? { state: { voice: { ...input.voice, feelings: input.voice.feelings.slice(0, VOICE_MAX_FEELINGS) } }, questions: { voice: score(VOICE_QUESTION, [...VOICE_LEVELS]) } }
    : null;

const rulesPart = (input: WardenInput): Pick<JudgeRequest, "state" | "questions"> | null => {
  const asked = keptRules(input.houseRules).map((rule, index) => ({ rule, index })).filter((entry) => !paragraphBreak(entry.rule, input.reply.text));
  if (!asked.length) return null;
  const context = input.houseRuleContext;
  const scene = context ? sceneState(context.scene) : null;
  const lore = context ? houseRuleLore(context.worldBook) : [];
  const reads = scene ? ` Judge it with \`scene\`${lore.length ? " and `world_book`" : ""}.` : "";
  return {
    state: {
      house_rules: Object.fromEntries(asked.map((entry) => [`rule_${entry.index}`, withPlayer(entry.rule, scene?.player ?? "")])),
      ...(scene ? { scene } : {}),
      ...(lore.length ? { world_book: Object.fromEntries(lore.map((entry, index) => [`entry_${index}`, { title: entry.comment, text: entry.text }])) } : {}),
    },
    questions: Object.fromEntries(asked.map((entry) => [`rule:${entry.index}`, noul(`Does \`reply\` break \`house_rules.rule_${entry.index}\`?${reads}`, { ...HOUSE_RULE_CRITERIA })])),
  };
};

const lorePart = (input: WardenInput): Pick<JudgeRequest, "state" | "questions"> | null => {
  const lore = keptLore(input.lore);
  if (!lore.length) return null;
  return {
    state: { lore: Object.fromEntries(lore.map((entry, index) => [`entry_${index}`, { title: entry.comment, text: entry.text }])) },
    questions: Object.fromEntries(lore.map((_, index) => [`lore:${index}`, noul(`Does \`reply\` contradict \`lore.entry_${index}\`?`, { ...LORE_CRITERIA })])),
  };
};

export function buildWardenRequests(input: WardenInput, arm: WardenArm = WARDEN_ARM): JudgeRequest[] {
  const continuity = input.facts.length ? buildContinuityRequest(input.reply, input.facts) : null;
  const rules = rulesPart(input);
  const own = rules && input.houseRuleContext ? [{ state: { reply: input.reply, ...rules.state }, questions: rules.questions }] : [];
  const parts = [agencyPart(input), attentionPart(input), voicePart(input), own.length ? null : rules, lorePart(input)]
    .filter((part): part is Pick<JudgeRequest, "state" | "questions"> => part !== null);
  if (arm === "separate") return [...(continuity ? [continuity] : []), ...parts.map((part) => ({ state: { reply: input.reply, ...part.state }, questions: part.questions })), ...own];
  if (!continuity && !parts.length) return own;
  const base = continuity ?? { state: { reply: input.reply }, questions: {} };
  return [parts.reduce<JudgeRequest>((request, part) => ({ state: { ...request.state, ...part.state }, questions: { ...request.questions, ...part.questions } }), base), ...own];
}

export function readWarden(answers: Record<string, JudgeAnswer>, input: WardenInput): WardenFinding[] {
  const findings: WardenFinding[] = [];
  const continuity = input.facts.length ? continuityNote(answers, input.facts) : null;
  if (continuity) findings.push({ family: "continuity", text: continuity.text, facts: continuity.facts });
  const agency = input.agency ? scoreAnswer(answers, "agency") : null;
  if (input.agency && agency && agency.score > AGENCY_SCORE) findings.push({ family: "agency", text: agencyNoteText(input.agency.player), facts: [], score: agency.score });
  const attention = input.attention ? scoreAnswer(answers, "attention") : null;
  if (input.attention && attention && attention.score < ATTENTION_SCORE) findings.push({ family: "attention", text: attentionNoteText(input.attention.player), facts: [], score: attention.score });
  const voice = input.voice ? scoreAnswer(answers, "voice") : null;
  if (input.voice && voice && voice.score < VOICE_SCORE) findings.push({ family: "voice", text: voiceNoteText(input.voice.speaker), facts: [], score: voice.score });
  const broken = keptRules(input.houseRules)
    .map((rule, index) => ({ rule, p: houseRuleP(answers, input, index) ?? 0 }))
    .filter((entry) => entry.p >= HOUSE_RULE_P)
    .sort((left, right) => right.p - left.p)
    .slice(0, HOUSE_RULE_MAX_NOTE)
    .map((entry) => entry.rule);
  if (broken.length) findings.push({ family: "house-rule", text: broken.map(houseRuleNoteLine).join("\n"), facts: [], rules: broken });
  return findings;
}

export function readWardenLore(answers: Record<string, JudgeAnswer>, input: WardenInput): WardenLoreFinding | null {
  const contradicted = keptLore(input.lore)
    .map((entry, index) => ({ entry, p: noulAnswer(answers, `lore:${index}`) ?? 0 }))
    .filter((item) => item.p >= WARDEN_LORE_P)
    .sort((left, right) => right.p - left.p)
    .slice(0, WARDEN_LORE_MAX_NOTE)
    .map((item) => item.entry);
  return contradicted.length ? { family: "lore", text: contradicted.map(loreNoteLine).join("\n"), lore: contradicted.map((entry) => entry.comment) } : null;
}

export const wardenFamiliesAsked = (input: WardenInput): WardenFamily[] => [
  ...(input.facts.length ? ["continuity" as const] : []),
  ...(input.agency ? ["agency" as const] : []),
  ...(input.attention ? ["attention" as const] : []),
  ...(input.voice ? ["voice" as const] : []),
  ...(keptRules(input.houseRules).length ? ["house-rule" as const] : []),
];

export const wardenRecordP = (answers: Record<string, JudgeAnswer> | null, input: WardenInput): Record<string, number> => {
  const findings = answers ? readWarden(answers, input) : [];
  const agency = answers && input.agency ? scoreAnswer(answers, "agency") : null;
  return {
    facts: Math.min(input.facts.length, CONTINUITY_MAX_FACTS),
    flagged: findings.find((finding) => finding.family === "continuity")?.facts.length ?? 0,
    ...(input.agency ? { agency: agency ? Number(agency.score.toFixed(3)) : -1 } : {}),
    ...(input.attention ? { attention: answers ? Number((scoreAnswer(answers, "attention")?.score ?? -1).toFixed(3)) : -1 } : {}),
    ...(input.voice ? { voice: answers ? Number((scoreAnswer(answers, "voice")?.score ?? -1).toFixed(3)) : -1 } : {}),
    ...(keptRules(input.houseRules).length ? { rules: keptRules(input.houseRules).length, broken: findings.find((finding) => finding.family === "house-rule")?.rules?.length ?? 0 } : {}),
    ...(keptLore(input.lore).length ? { lore: keptLore(input.lore).length, contradicted: answers ? readWardenLore(answers, input)?.lore.length ?? 0 : 0 } : {}),
  };
};
