import type { Story } from "@engine/index";
import { isRecord } from "@utils/guards";
import { normalizeJsonText } from "@utils/json";
import type { ProvisioningEnvironment, ProvisioningOp } from "@wizard/index";
import type { AgentOp } from "./agent/types";
import { ALL_AUDIENCES, findTopic } from "./knowledge/index";
import { FIRST_MESSAGE_RULE } from "./prompts";
import { cardRosterId } from "./proposal";
import {
  CARD_TOKEN_BUDGET, cardBlocked, exampleBlocksWithoutChar, reviewCard, savedName, speaksForPlayer, THIN_DESCRIPTION_TOKENS,
  type CardCheckInput, type CardFinding, type CardStepId,
} from "@wizard/cardChecks";

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

export type TutorialStepId = CardStepId;

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
    why: "The description is in every prompt for this character. Write how they act and speak in the trigger form (\"When X, they do Y\") rather than a list "
      + "of adjectives the model has to guess from. A side character gets one line on why scenes include them.",
    topics: ["st/card-fields", "st/card-review"], fields: ["description", "personality"],
  },
  {
    id: "first", label: "First message",
    why: "In a group every card with a greeting speaks when a chat opens, so only the opening scene's cast gets one. It sets the length and tone of every reply, and never says what the player does.",
    topics: ["st/first-message", "author/opening-scene"], fields: ["first_mes"],
  },
  {
    id: "examples", label: "Example dialogue",
    why: "Examples show the voice in use: accent, rhythm, how a power works. Each block starts with <START> and needs a {{char}}: line, or Chat Completion drops it. "
      + "Never use the {{system}} macro there.",
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

export type TutorialFinding = CardFinding;

export { CARD_TOKEN_BUDGET, exampleBlocksWithoutChar, savedName, speaksForPlayer, THIN_DESCRIPTION_TOKENS };

export const tutorialCheckInput = (card: TutorialCard): CardCheckInput => ({
  name: card.name, description: card.description, personality: card.personality, first_mes: card.first_mes, mes_example: card.mes_example, opening: card.opening,
});

export const reviewTutorialCard = (card: TutorialCard, environment: Pick<ProvisioningEnvironment, "characterNames">): TutorialFinding[] =>
  reviewCard(tutorialCheckInput(card), environment, "dropped");

export const tutorialBlocked = (findings: readonly TutorialFinding[]): boolean => cardBlocked(findings);

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

export const tutorialRosterId = (draft: Story, name: string): string => {
  const wanted = savedName(name).toLowerCase();
  return draft.roster.find((member) => (member.name ?? member.id).trim().toLowerCase() === wanted)?.id ?? cardRosterId(savedName(name));
};

export const tutorialLookOps = (draft: Story, card: TutorialCard): AgentOp[] => {
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
    + "each trait shown by a behaviour in the trigger form (\"When X, they do Y\"); for a side character, one line on why scenes include them. Then a one-line personality summary.",
  first: `Write the first message: the opening scene from this character, in motion, with the senses, ending on a hook. ${FIRST_MESSAGE_RULE} Never say what the player does, says or feels.`,
  examples: "Write two short example blocks. Each starts with <START> on its own line and has {{char}}: lines (and {{user}}: lines if needed) showing the voice in use. Never use {{system}}.",
};

export const DRAFT_MAX_TOKENS = 900;

export const renderTutorialDraftPrompt = (step: Exclude<TutorialStepId, "review">, card: TutorialCard, story: Pick<Story, "title" | "description"> | null): string => {
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
