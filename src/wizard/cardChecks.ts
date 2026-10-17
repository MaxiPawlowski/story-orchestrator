import type { StoryV2 } from "@engine/index";
import { isRecord } from "@utils/guards";
import type { ProvisioningEnvironment, ProvisioningOp } from "./types";

export type CardStepId = "who" | "look" | "voice" | "first" | "examples" | "review";

export type CardSeverity = "blocks" | "warns";

export interface CardFinding {
  id: string;
  severity: CardSeverity;
  text: string;
  topic: string;
  step: CardStepId;
}

export interface CardCheckInput {
  name: string;
  description: string;
  personality: string;
  first_mes: string;
  mes_example: string;
  opening: boolean | null;
}

export type GreetingOutsideOpening = "dropped" | "greets";

export const CARD_TOKEN_BUDGET = 2000;
export const THIN_DESCRIPTION_TOKENS = 40;

const ILLEGAL_NAME = /[/?<>\\:*|"]/;
const COMMON_WORDS = new Set([
  "a", "an", "and", "are", "as", "at", "be", "but", "by", "can", "do", "for", "from", "go", "he", "her", "him", "his", "how", "i", "if", "in", "is", "it", "its", "me",
  "my", "no", "not", "now", "of", "off", "oh", "on", "one", "or", "our", "out", "she", "so", "the", "them", "then", "there", "they", "this", "to", "up", "us", "was",
  "we", "what", "when", "who", "why", "will", "with", "yes", "you", "your", "old", "new", "big", "little", "good", "bad", "red", "black", "white", "lady", "lord",
  "king", "queen", "man", "woman", "boy", "girl", "dog", "cat", "may", "just", "love", "hope", "grace", "rose", "sky", "sun", "moon", "star", "night", "day",
]);

export const estimateCardTextTokens = (card: Pick<CardCheckInput, "description" | "personality" | "first_mes" | "mes_example" | "opening">): number =>
  Math.ceil([card.description, card.personality, card.opening !== false ? card.first_mes : "", card.mes_example].join("\n").length / 4);

export const savedName = (name: string): string => name.replace(/[/?<>\\:*|"]/g, "").replace(/[.\s]+$/, "").trim();

const nameWords = (name: string) => name.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean);

const USER_ACTION = /\{\{user\}\}\s+(?:\w+(?:s|ed)\b|is\b|was\b|feels?\b|says?\b|nods?\b|smiles?\b|looks?\b|thinks?\b|decides?\b|wants?\b)/i;
const YOU_ACTION = /\byou\s+(?:feel|felt|walk|walked|say|said|nod|nodded|smile|smiled|look|looked|decide|decided|think|thought|want|wanted|reach|reached|step|stepped|take|took)\b/i;

export const speaksForPlayer = (text: string): boolean => USER_ACTION.test(text) || YOU_ACTION.test(text);

export const exampleBlocksWithoutChar = (text: string): number => text.split(/<START>/i).map((block) => block.trim()).filter(Boolean).filter((block) => !/\{\{char\}\}\s*:/i.test(block)).length;

const adjectiveList = (text: string) => {
  const sentences = text.split(/[.!?](?:\s|$)/).filter((part) => part.trim().split(/\s+/).length > 3).length;
  return sentences < 2 && (text.match(/,/g) ?? []).length >= 4;
};

const TRAIT_ITEM_WORDS = 2;
const TRIGGER_FORM = /\b(?:when|whenever|if|every time|each time|as soon as|the moment)\b/i;

export const listedTraits = (personality: string): string[] => {
  const items = personality.split(/[,;\n]|\band\b/).map((item) => item.trim()).filter(Boolean);
  return items.length >= 2 && items.every((item) => item.split(/\s+/).length <= TRAIT_ITEM_WORDS) ? items : [];
};

export const showsBehaviour = (description: string): boolean =>
  description.split(/[.!?\n](?:\s|$)/).some((sentence) => TRIGGER_FORM.test(sentence) && sentence.trim().split(/\s+/).length > 3);

const COPY = {
  thin: "The description is very short; the model will fill the gaps with guesses.",
  adjectives: "The description reads as a list of adjectives. Show each trait as something they do or say.",
  budget: (tokens: number) => `About ${tokens} tokens: over ${CARD_TOKEN_BUDGET}, the card crowds out the chat itself. Move long lists into a lorebook.`,
  notOpening: {
    dropped: "This character is not in the opening scene, so the first message will be left off the card.",
    greets: "This character is not in the opening scene (the start checkpoint disables them), but every card with a first message greets when a group chat opens: leave the first message out.",
  },
  noGreeting: "This character opens the story but has no first message, so the chat opens without one from them.",
  traits: (traits: string[]) => `The personality lists traits (${traits.join(", ")}), but no sentence in the description shows one in action. `
    + "Add the trigger form for the main ones: \"When X, they do Y\".",
} as const;

export const reviewCard = (
  card: CardCheckInput,
  environment: Pick<ProvisioningEnvironment, "characterNames">,
  outsideOpening: GreetingOutsideOpening = "dropped",
): CardFinding[] => {
  const findings: CardFinding[] = [];
  const push = (id: string, severity: CardSeverity, step: CardStepId, topic: string, text: string) => findings.push({ id, severity, step, topic, text });
  const name = card.name.trim();
  if (!name) push("name-missing", "blocks", "who", "st/card-names", "The character has no name yet.");
  if (name && environment.characterNames.some((existing) => existing.trim().toLowerCase() === savedName(name).toLowerCase())) {
    push("name-taken", "blocks", "who", "st/card-names", `A card named "${savedName(name)}" already exists. The wizard only creates new cards, so pick another name.`);
  }
  if (name && (ILLEGAL_NAME.test(name) || savedName(name) !== name)) push("name-sanitized", "warns", "who", "st/card-names", `SillyTavern will save this name as "${savedName(name)}".`);
  const trap = nameWords(name).filter((word) => COMMON_WORDS.has(word) || word.length < 3);
  if (trap.length) push("name-mention-trap", "warns", "who", "st/card-names", `"${trap.join("\", \"")}" is an everyday word, so in a group almost any message will mention this character.`);
  if (name && /[^\p{ASCII}]/u.test(name)) push("name-not-ascii", "warns", "who", "st/card-names", "Group mentions only see plain letters, so accented letters split the name into fragments.");
  if (!card.description.trim()) push("description-empty", "blocks", "voice", "st/card-fields", "The description is empty: the model would know nothing about this character.");
  else if (Math.ceil(card.description.length / 4) < THIN_DESCRIPTION_TOKENS) push("description-thin", "warns", "voice", "st/card-review", COPY.thin);
  if (card.description.trim() && adjectiveList(card.description)) push("voice-adjectives", "warns", "voice", "st/card-review", COPY.adjectives);
  const traits = listedTraits(card.personality);
  if (card.description.trim() && traits.length && !showsBehaviour(card.description)) push("trait-no-behaviour", "warns", "voice", "st/card-review", COPY.traits(traits));
  const tokens = estimateCardTextTokens(card);
  if (tokens > CARD_TOKEN_BUDGET) push("token-budget", "warns", "voice", "st/card-review", COPY.budget(tokens));
  if (card.opening !== false && card.first_mes.trim() && speaksForPlayer(card.first_mes)) {
    push("greeting-speaks-for-player", "warns", "first", "st/first-message", "The first message says what the player does or feels; the model will copy that and speak for the player.");
  }
  if (card.opening === false && card.first_mes.trim()) push("greeting-not-opening", "warns", "first", "author/opening-scene", COPY.notOpening[outsideOpening]);
  if (card.opening === true && !card.first_mes.trim()) push("greeting-missing", "warns", "first", "st/first-message", COPY.noGreeting);
  const bare = card.mes_example.trim() ? exampleBlocksWithoutChar(card.mes_example) : 0;
  if (bare) push("examples-no-char-line", "warns", "examples", "st/example-dialogue", `${bare} example block(s) have no {{char}}: line; Chat Completion drops them.`);
  return findings;
};

export const cardBlocked = (findings: readonly CardFinding[]): boolean => findings.some((finding) => finding.severity === "blocks");

export const cardWarnings = (findings: readonly CardFinding[]): CardFinding[] => findings.filter((finding) => finding.severity === "warns");

const fold = (text: string) => text.trim().toLowerCase();

const castNames = (value: unknown): string[] => (Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string").map(fold) : []);

export const startCheckpoint = (draft: Pick<StoryV2, "checkpoints">) => draft.checkpoints.find((checkpoint) => checkpoint.start) ?? draft.checkpoints[0];

export const inOpeningCast = (draft: Pick<StoryV2, "checkpoints">, name: string): boolean | null => {
  const cast = startCheckpoint(draft)?.effects?.cast_changes;
  if (!isRecord(cast)) return null;
  const wanted = fold(savedName(name));
  if (castNames(cast.disable).includes(wanted)) return false;
  return castNames(cast.enable).includes(wanted) ? true : null;
};

export const cardFindings = (
  op: Extract<ProvisioningOp, { kind: "createCharacterCard" }>,
  draft: Pick<StoryV2, "checkpoints">,
  environment: Pick<ProvisioningEnvironment, "characterNames">,
): CardFinding[] => reviewCard({
  name: op.name, description: op.description, personality: op.personality ?? "", first_mes: op.first_mes ?? "", mes_example: op.mes_example ?? "",
  opening: inOpeningCast(draft, op.name),
}, environment, "greets");

export const renderCardNotes = (findings: readonly CardFinding[]): string => findings.map((finding) => finding.text).join(" ");
