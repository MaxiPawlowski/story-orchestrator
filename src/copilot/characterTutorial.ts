import type { StoryV2 } from "@engine/index";
import { isRecord } from "@utils/guards";
import { normalizeJsonText } from "@utils/json";
import type { ProvisioningEnvironment, ProvisioningOp } from "@wizard/index";
import type { AgentOp } from "./agent/types";
import { ALL_AUDIENCES, findTopic } from "./knowledge/index";
import { FIRST_MESSAGE_RULE } from "./prompts";
import { cardRosterId } from "./proposal";

export interface TutorialCard {
  name: string;
  role: string;
  concept: string;
  appearance: string;
  description: string;
  personality: string;
  opening: boolean;
  first_mes: string;
  mes_example: string;
}

export type TutorialField = Exclude<keyof TutorialCard, "opening">;

export const emptyTutorialCard = (): TutorialCard => ({ name: "", role: "", concept: "", appearance: "", description: "", personality: "", opening: false, first_mes: "", mes_example: "" });

export type TutorialStepId = "who" | "look" | "voice" | "first" | "examples" | "review";

export interface TutorialStep {
  id: TutorialStepId;
  label: string;
  why: string;
  topics: readonly string[];
  fields: readonly TutorialField[];
}

export const TUTORIAL_STEPS: readonly TutorialStep[] = [
  {
    id: "who", label: "Who are they",
    why: "A short, unique name is how the story, the group and the mentions find this character. The role and one-line concept keep every later step pointed the same way.",
    topics: ["st/card-names", "author/roster"], fields: ["name", "role", "concept"],
  },
  {
    id: "look", label: "Look",
    why: "Pictures and sprites draw the character from this text, so describe what a camera would see. It is saved in the story, not on the card, so the card stays about behaviour.",
    topics: ["author/presentation", "st/image-generation"], fields: ["appearance"],
  },
  {
    id: "voice", label: "Voice",
    why: "The description is in every prompt for this character. Write how they act and speak, with an example of each trait, rather than a list of adjectives the model has to guess from.",
    topics: ["st/card-fields", "st/card-review"], fields: ["description", "personality"],
  },
  {
    id: "first", label: "First message",
    why: "In a group every card with a greeting speaks when a chat opens, so only the opening scene's cast gets one. It sets the length and tone of every reply, and never says what the player does.",
    topics: ["st/first-message", "author/opening-scene"], fields: ["first_mes"],
  },
  {
    id: "examples", label: "Example dialogue",
    why: "Examples show the voice in use: accent, rhythm, how a power works. Each block starts with <START> and needs a {{char}}: line, or Chat Completion drops it.",
    topics: ["st/example-dialogue"], fields: ["mes_example"],
  },
  {
    id: "review", label: "Review",
    why: "The common card mistakes, checked before the card is created. Nothing is created until you confirm the card.",
    topics: ["st/card-review"], fields: [],
  },
];

export const FIELD_LABELS: Record<TutorialField, string> = {
  name: "Name", role: "Role in the story", concept: "One-line concept", appearance: "Appearance", description: "Description", personality: "Personality",
  first_mes: "First message", mes_example: "Example dialogue",
};

export const tutorialTopicIds = (): string[] => [...new Set(TUTORIAL_STEPS.flatMap((step) => step.topics))];

export const missingTutorialTopics = (): string[] => tutorialTopicIds().filter((id) => !findTopic(id, ALL_AUDIENCES));

export type ReviewSeverity = "blocks" | "warns";

export interface TutorialFinding {
  id: string;
  severity: ReviewSeverity;
  text: string;
  topic: string;
  step: TutorialStepId;
}

export const CARD_TOKEN_BUDGET = 2000;
export const THIN_DESCRIPTION_TOKENS = 40;

const ILLEGAL_NAME = /[/?<>\\:*|"]/;
const COMMON_WORDS = new Set([
  "a", "an", "and", "are", "as", "at", "be", "but", "by", "can", "do", "for", "from", "go", "he", "her", "him", "his", "how", "i", "if", "in", "is", "it", "its", "me",
  "my", "no", "not", "now", "of", "off", "oh", "on", "one", "or", "our", "out", "she", "so", "the", "them", "then", "there", "they", "this", "to", "up", "us", "was",
  "we", "what", "when", "who", "why", "will", "with", "yes", "you", "your", "old", "new", "big", "little", "good", "bad", "red", "black", "white", "lady", "lord",
  "king", "queen", "man", "woman", "boy", "girl", "dog", "cat", "may", "just", "love", "hope", "grace", "rose", "sky", "sun", "moon", "star", "night", "day",
]);

export const estimateCardTokens = (card: TutorialCard): number =>
  Math.ceil([card.description, card.personality, card.opening ? card.first_mes : "", card.mes_example].join("\n").length / 4);

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

const REVIEW_COPY = {
  thin: "The description is very short; the model will fill the gaps with guesses.",
  adjectives: "The description reads as a list of adjectives. Show each trait as something they do or say.",
  budget: (tokens: number) => `About ${tokens} tokens: over ${CARD_TOKEN_BUDGET}, the card crowds out the chat itself. Move long lists into a lorebook.`,
  notOpening: "This character is not in the opening scene, so the first message will be left off the card.",
  noGreeting: "This character opens the story but has no first message, so the chat opens without one from them.",
} as const;

export const reviewTutorialCard = (card: TutorialCard, environment: Pick<ProvisioningEnvironment, "characterNames">): TutorialFinding[] => {
  const findings: TutorialFinding[] = [];
  const push = (id: string, severity: ReviewSeverity, step: TutorialStepId, topic: string, text: string) => findings.push({ id, severity, step, topic, text });
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
  else if (Math.ceil(card.description.length / 4) < THIN_DESCRIPTION_TOKENS) push("description-thin", "warns", "voice", "st/card-review", REVIEW_COPY.thin);
  if (card.description.trim() && adjectiveList(card.description)) push("voice-adjectives", "warns", "voice", "st/card-review", REVIEW_COPY.adjectives);
  const tokens = estimateCardTokens(card);
  if (tokens > CARD_TOKEN_BUDGET) push("token-budget", "warns", "voice", "st/card-review", REVIEW_COPY.budget(tokens));
  if (card.opening && card.first_mes.trim() && speaksForPlayer(card.first_mes)) {
    push("greeting-speaks-for-player", "warns", "first", "st/first-message", "The first message says what the player does or feels; the model will copy that and speak for the player.");
  }
  if (!card.opening && card.first_mes.trim()) push("greeting-not-opening", "warns", "first", "author/opening-scene", REVIEW_COPY.notOpening);
  if (card.opening && !card.first_mes.trim()) push("greeting-missing", "warns", "first", "st/first-message", REVIEW_COPY.noGreeting);
  const bare = card.mes_example.trim() ? exampleBlocksWithoutChar(card.mes_example) : 0;
  if (bare) push("examples-no-char-line", "warns", "examples", "st/example-dialogue", `${bare} example block(s) have no {{char}}: line; Chat Completion drops them.`);
  return findings;
};

export const tutorialBlocked = (findings: readonly TutorialFinding[]): boolean => findings.some((finding) => finding.severity === "blocks");

const optional = (key: string, value: string) => (value.trim() ? { [key]: value.trim() } : {});

export const tutorialCardOp = (card: TutorialCard): Extract<ProvisioningOp, { kind: "createCharacterCard" }> => ({
  kind: "createCharacterCard",
  name: savedName(card.name),
  description: card.description.trim(),
  ...optional("role", card.role),
  ...optional("personality", card.personality),
  ...(card.opening ? optional("first_mes", card.first_mes) : {}),
  ...optional("mes_example", card.mes_example),
});

export const tutorialRosterId = (draft: StoryV2, name: string): string => {
  const wanted = savedName(name).toLowerCase();
  return draft.roster.find((member) => (member.name ?? member.id).trim().toLowerCase() === wanted)?.id ?? cardRosterId(savedName(name));
};

export const tutorialLookOps = (draft: StoryV2, card: TutorialCard): AgentOp[] => {
  const name = savedName(card.name);
  if (!name || !card.appearance.trim()) return [];
  const id = tutorialRosterId(draft, name);
  const known = draft.roster.some((member) => member.id === id);
  return [
    ...(known ? [] : [{ kind: "addRosterMember" as const, member: { id, name, ...(card.role.trim() ? { role: card.role.trim() } : {}) } }]),
    { kind: "setAppearance", id, appearance: card.appearance.trim() },
  ];
};

const STEP_ASK: Record<Exclude<TutorialStepId, "review">, string> = {
  who: "Propose a name (short, unique, plain letters, not an everyday word), the role this character plays in the story, and a one-line concept.",
  look: "Describe what a camera would see: build, face, hair, clothes, one distinctive detail. Two sentences, no personality.",
  voice: "Write the description in third person, in clear sentences under light headings (who they are, how they act, how they speak, what they want), "
    + "each trait shown by a behaviour. Then a one-line personality summary.",
  first: `Write the first message: the opening scene from this character, in motion, with the senses, ending on a hook. ${FIRST_MESSAGE_RULE} Never say what the player does, says or feels.`,
  examples: "Write two short example blocks. Each starts with <START> on its own line and has {{char}}: lines (and {{user}}: lines if needed) showing the voice in use.",
};

export const DRAFT_MAX_TOKENS = 900;

export const renderTutorialDraftPrompt = (step: Exclude<TutorialStepId, "review">, card: TutorialCard, story: Pick<StoryV2, "title" | "description"> | null): string => {
  const fields = TUTORIAL_STEPS.find((entry) => entry.id === step)?.fields ?? [];
  const known = (Object.keys(FIELD_LABELS) as TutorialField[]).filter((field) => card[field].trim()).map((field) => `${FIELD_LABELS[field]}: ${card[field].trim()}`);
  return [
    "You help an author build one SillyTavern character card, one step at a time.",
    ...(story ? [`The story: "${story.title}". ${story.description}`] : []),
    known.length ? `What the author has so far:\n${known.join("\n")}` : "The author has written nothing yet.",
    `This step: ${STEP_ASK[step]}`,
    `Reply with exactly one JSON object with these string keys and nothing else: ${fields.map((field) => `"${field}"`).join(", ")}.`,
  ].join("\n\n");
};

export const parseTutorialDraft = (step: TutorialStepId, raw: string): Partial<Record<TutorialField, string>> => {
  const fields = TUTORIAL_STEPS.find((entry) => entry.id === step)?.fields ?? [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(normalizeJsonText(raw));
  } catch {
    return {};
  }
  if (!isRecord(parsed)) return {};
  const record = parsed;
  return Object.fromEntries(fields.flatMap((field) => (typeof record[field] === "string" && String(record[field]).trim() ? [[field, String(record[field]).trim()]] : [])));
};
