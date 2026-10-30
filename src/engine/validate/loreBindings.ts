import { PARTY_LOCATION_KEY, type Quality, type StoryCodex, type StoryRequirements, type ValidationError } from "../schema";
import { LORE_BINDINGS_MAX, LORE_BINDING_KEYS, type LoreBinding, type LoreBindings } from "../loreBindingSchema";
import { isRecord } from "@utils/guards";
import { addError, asString, rejectUnknownKeys } from "./common";

const fold = (text: string) => text.trim().toLowerCase();

const readBinding = (value: unknown, path: string, books: readonly string[], errors: ValidationError[]): LoreBinding | null => {
  if (!isRecord(value)) {
    addError(errors, path, "a lore binding is {book, entry}: a lorebook the story lists and the exact comment of one entry in it");
    return null;
  }
  rejectUnknownKeys(value, LORE_BINDING_KEYS, path, errors);
  const book = asString(value.book)?.trim() ?? "";
  const entry = asString(value.entry)?.trim() ?? "";
  if (!book) addError(errors, `${path}.book`, "book names one of the story's lorebooks");
  else if (!books.some((listed) => fold(listed) === fold(book))) addError(errors, `${path}.book`, `"${book}" is not in requirements.lorebooks; a binding points only at the story's own books`);
  if (!entry) addError(errors, `${path}.entry`, "entry is the exact comment of one entry in that book");
  return book && entry && books.some((listed) => fold(listed) === fold(book)) ? { book, entry } : null;
};

export const readLoreBindings = (value: unknown, path: string, books: readonly string[], errors: ValidationError[]): LoreBindings | undefined => {
  if (value === undefined) return undefined;
  if (!isRecord(value)) {
    addError(errors, path, "lore bindings are an object keyed by what they bind");
    return undefined;
  }
  const keys = Object.keys(value);
  if (keys.length > LORE_BINDINGS_MAX) addError(errors, path, `at most ${String(LORE_BINDINGS_MAX)} bindings`);
  const bindings: LoreBindings = {};
  for (const key of keys.slice(0, LORE_BINDINGS_MAX)) {
    if (!key.trim()) {
      addError(errors, `${path}.${key}`, "a binding key is not empty");
      continue;
    }
    const binding = readBinding(value[key], `${path}.${key}`, books, errors);
    if (binding) bindings[key] = binding;
  }
  return Object.keys(bindings).length ? bindings : undefined;
};

export interface LoreBindingRefs {
  qualityByKey: Record<string, Quality>;
  codex?: StoryCodex;
}

export const checkLoreBindings = (requirements: StoryRequirements | undefined, refs: LoreBindingRefs, errors: ValidationError[]): void => {
  const places = Object.keys(requirements?.place_lore ?? {});
  if (places.length) {
    const location = refs.qualityByKey[PARTY_LOCATION_KEY];
    if (!location) addError(errors, "requirements.place_lore", `place_lore binds values of the "${PARTY_LOCATION_KEY}" quality, which this story does not declare`);
    else if (location.values?.length) {
      for (const place of places.filter((value) => !location.values?.includes(value))) {
        addError(errors, `requirements.place_lore.${place}`, `"${place}" is not a value of the "${PARTY_LOCATION_KEY}" quality (${location.values.join(", ")})`);
      }
    }
  }
  const people = new Set((refs.codex?.people ?? []).map((entry) => entry.id));
  for (const id of Object.keys(requirements?.people_lore ?? {}).filter((key) => !people.has(key))) {
    addError(errors, `requirements.people_lore.${id}`, `"${id}" is not a codex people entry id`);
  }
};
