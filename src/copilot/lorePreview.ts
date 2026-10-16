import { checkpointWorldInfo, type StoryV2 } from "@engine/index";
import type { HostScannableEntry } from "@services/STAPI";
import type { ProvisioningOp } from "@wizard/index";
import { activationUncertainty, matchKey } from "@runtime/loreKeyMatch";
import { LORE_KEY_LOGIC_CODE, parseKeyRegex } from "@utils/wiKeys";

type LoreEntryOp = Extract<ProvisioningOp, { kind: "upsertLorebookEntry" }>;

export interface DraftText {
  label: string;
  text: string;
}

export interface DraftCard {
  name: string;
  description?: string;
  first_mes?: string;
}

export interface KeyMatchPreview {
  matches: string[];
  reasons: string[];
}

export interface LoreLint {
  id: "short-key" | "shared-key" | "secondary-repeats-primary" | "sticky-on-constant";
  text: string;
}

export interface LintEntry {
  comment: string;
  key: string[];
  keysecondary?: string[];
  selective?: boolean;
  selectiveLogic?: number;
  constant?: boolean;
  sticky?: number;
}

export const SHORT_KEY_LENGTH = 3;
export const SHARED_KEY_ENTRIES = 2;
export const REPEAT_PREFIX = 5;
const PREVIEW_DEPTH = 2;
const DEFAULT_MATCH = { caseSensitive: false, matchWholeWords: false };

const clean = (keys: readonly string[] | undefined) => (keys ?? []).map((key) => key.trim()).filter(Boolean);

export const loreOpEntry = (op: LoreEntryOp): HostScannableEntry => {
  const secondary = clean(op.secondaryKeys);
  return {
    world: op.lorebook, uid: 0, comment: op.comment, content: op.content, key: clean(op.keys),
    ...(op.constant ? { constant: true } : {}),
    ...(secondary.length ? { keysecondary: secondary, selective: true, selectiveLogic: LORE_KEY_LOGIC_CODE[op.logic ?? "and-any"] } : {}),
    ...(op.triggers?.length ? { triggers: op.triggers } : {}),
  };
};

export const loreOpLintEntry = (op: LoreEntryOp): LintEntry => {
  const entry = loreOpEntry(op);
  return {
    comment: op.comment, key: clean(op.keys), keysecondary: clean(op.secondaryKeys), selective: entry.selective === true,
    ...(typeof entry.selectiveLogic === "number" ? { selectiveLogic: entry.selectiveLogic } : {}), constant: op.constant === true,
  };
};

export const draftLoreTexts = (draft: Pick<StoryV2, "checkpoints" | "briefing" | "description">, cards: readonly DraftCard[] = []): DraftText[] => [
  ...(draft.description?.trim() ? [{ label: "story description", text: draft.description }] : []),
  ...draft.checkpoints.filter((checkpoint) => checkpoint.objective?.trim()).map((checkpoint) => ({ label: `objective of ${checkpoint.name || checkpoint.id}`, text: checkpoint.objective })),
  ...(draft.briefing?.sections ?? []).filter((section) => section.text?.trim()).map((section) => ({ label: `briefing: ${section.heading || "section"}`, text: section.text })),
  ...cards.flatMap((card) => [
    ...(card.first_mes?.trim() ? [{ label: `${card.name}'s opening message`, text: card.first_mes }] : []),
    ...(card.description?.trim() ? [{ label: `${card.name}'s card`, text: card.description }] : []),
  ]),
];

export const gatedAt = (draft: Pick<StoryV2, "checkpoints">, lorebook: string, comment: string): string[] => {
  const fold = (text: string) => text.trim().toLowerCase();
  return draft.checkpoints.filter((checkpoint) => checkpointWorldInfo(checkpoint).enable
    .some((ref) => fold(ref.lorebook) === fold(lorebook) && ref.comments.some((entry) => fold(entry) === fold(comment))))
    .map((checkpoint) => checkpoint.name || checkpoint.id);
};

export const previewKeyMatches = (entry: HostScannableEntry, texts: readonly DraftText[], gated: readonly string[] = []): KeyMatchPreview => {
  const keys = clean(Array.isArray(entry.key) ? entry.key.filter((key): key is string => typeof key === "string") : []);
  const options = {
    caseSensitive: typeof entry.caseSensitive === "boolean" ? entry.caseSensitive : DEFAULT_MATCH.caseSensitive,
    matchWholeWords: typeof entry.matchWholeWords === "boolean" ? entry.matchWholeWords : DEFAULT_MATCH.matchWholeWords,
  };
  const matches = texts.filter((text) => keys.some((key) => matchKey(text.text, key, options))).map((text) => text.label);
  const reasons = [
    ...activationUncertainty(entry, { depth: PREVIEW_DEPTH, trigger: null }),
    ...(gated.length ? [`gated: on only from ${gated.join(", ")}`] : []),
  ];
  return { matches, reasons };
};

export const renderKeyMatchLine = (preview: KeyMatchPreview): string => (preview.matches.length
  ? `Key matches these draft texts: ${preview.matches.join("; ")}.`
  : "No draft text contains any key.");

const prefix = (key: string) => key.toLowerCase().slice(0, REPEAT_PREFIX);

const repeats = (secondary: string, primary: string) => {
  const a = secondary.toLowerCase();
  const b = primary.toLowerCase();
  if (a === b) return true;
  return a.length >= REPEAT_PREFIX && b.length >= REPEAT_PREFIX && prefix(a) === prefix(b);
};

export const loreKeyLint = (entry: LintEntry, siblings: readonly LintEntry[] = []): LoreLint[] => {
  const lint: LoreLint[] = [];
  const primary = clean(entry.key);
  const secondary = clean(entry.keysecondary);
  const plain = (key: string) => !parseKeyRegex(key);
  const short = [...primary, ...secondary].filter((key) => plain(key) && key.length < SHORT_KEY_LENGTH);
  if (short.length) {
    const named = short.map((key) => `"${key}"`).join(", ");
    lint.push({ id: "short-key", text: `${named} ${short.length === 1 ? "is" : "are"} under ${SHORT_KEY_LENGTH} characters, so it matches inside almost any message.` });
  }
  const others = siblings.filter((sibling) => sibling.comment.trim().toLowerCase() !== entry.comment.trim().toLowerCase());
  const shared = primary.filter((key) => 1 + others.filter((sibling) => clean(sibling.key).some((other) => other.toLowerCase() === key.toLowerCase())).length > SHARED_KEY_ENTRIES);
  if (shared.length) {
    lint.push({ id: "shared-key", text: `${shared.map((key) => `"${key}"`).join(", ")} is a key of more than ${SHARED_KEY_ENTRIES} entries in this book, so they all fire together.` });
  }
  const andAny = entry.selective === true && (entry.selectiveLogic ?? 0) === LORE_KEY_LOGIC_CODE["and-any"];
  const echo = andAny ? secondary.filter((key) => plain(key) && primary.some((main) => plain(main) && repeats(key, main))) : [];
  if (echo.length) lint.push({ id: "secondary-repeats-primary", text: `Secondary ${echo.map((key) => `"${key}"`).join(", ")} repeats a primary key; it narrows nothing.` });
  if (entry.constant === true && typeof entry.sticky === "number" && entry.sticky > 0) {
    lint.push({ id: "sticky-on-constant", text: "Sticky does nothing on an entry that is always in context." });
  }
  return lint;
};

export const opCards = (ops: readonly ProvisioningOp[]): DraftCard[] => ops.flatMap((op) => (op.kind === "createCharacterCard"
  ? [{ name: op.name, description: op.description, ...(op.first_mes ? { first_mes: op.first_mes } : {}) }]
  : []));

export const bookSiblings = (ops: readonly ProvisioningOp[], lorebook: string): LintEntry[] => ops.flatMap((op) => (op.kind === "upsertLorebookEntry"
  && op.lorebook.trim().toLowerCase() === lorebook.trim().toLowerCase() ? [loreOpLintEntry(op)] : []));
