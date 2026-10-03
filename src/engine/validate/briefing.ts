import {
  BRIEFING_HEADING_MAX_CHARS, BRIEFING_LABEL_MAX_CHARS, BRIEFING_LINE_MAX_CHARS, BRIEFING_MAX_SECTIONS, BRIEFING_SECTION_MAX_CHARS,
  type BriefingSection, type StoryBriefing, type ValidationError,
} from "../schema";
import { isRecord } from "@utils/guards";
import { addError, rejectUnknownKeys } from "./common";

const BRIEFING_KEYS = ["title", "image", "sections", "tone", "start_label"] as const;
const SECTION_KEYS = ["heading", "text"] as const;
const MACRO = /\{\{[^}]*\}\}/;

const readText = (value: unknown, path: string, max: number, errors: ValidationError[], required = false): string | undefined => {
  if (value === undefined) {
    if (required) addError(errors, path, "is required");
    return undefined;
  }
  if (typeof value !== "string") return void addError(errors, path, "must be text");
  const text = value.trim();
  if (!text) return void (required && addError(errors, path, "must not be empty"));
  if (text.length > max) return void addError(errors, path, `is at most ${max} characters (has ${text.length})`);
  if (MACRO.test(text)) return void addError(errors, path, "is shown as written, so it cannot hold a macro like {{user}}");
  return text;
};

const readSection = (value: unknown, path: string, errors: ValidationError[]): BriefingSection | null => {
  if (!isRecord(value)) {
    addError(errors, path, "a section must be { heading, text }");
    return null;
  }
  rejectUnknownKeys(value, SECTION_KEYS, path, errors);
  const heading = readText(value.heading, `${path}.heading`, BRIEFING_HEADING_MAX_CHARS, errors, true);
  const text = readText(value.text, `${path}.text`, BRIEFING_SECTION_MAX_CHARS, errors, true);
  return heading && text ? { heading, text } : null;
};

export const readBriefing = (value: unknown, path: string, errors: ValidationError[]): StoryBriefing | undefined => {
  if (value === undefined) return undefined;
  if (!isRecord(value)) return void addError(errors, path, "briefing must be an object");
  rejectUnknownKeys(value, BRIEFING_KEYS, path, errors);
  if (!Array.isArray(value.sections)) return void addError(errors, `${path}.sections`, "sections must be a list of { heading, text }");
  if (!value.sections.length) addError(errors, `${path}.sections`, "a briefing needs at least one section");
  if (value.sections.length > BRIEFING_MAX_SECTIONS) addError(errors, `${path}.sections`, `a briefing holds at most ${BRIEFING_MAX_SECTIONS} sections`);
  const sections = value.sections.map((entry, index) => readSection(entry, `${path}.sections.${index}`, errors)).filter((entry): entry is BriefingSection => entry !== null);
  const title = readText(value.title, `${path}.title`, BRIEFING_LINE_MAX_CHARS, errors);
  const image = readText(value.image, `${path}.image`, BRIEFING_LINE_MAX_CHARS, errors);
  const tone = readText(value.tone, `${path}.tone`, BRIEFING_LINE_MAX_CHARS, errors);
  const startLabel = readText(value.start_label, `${path}.start_label`, BRIEFING_LABEL_MAX_CHARS, errors);
  return {
    ...(title ? { title } : {}),
    ...(image ? { image } : {}),
    sections,
    ...(tone ? { tone } : {}),
    ...(startLabel ? { start_label: startLabel } : {}),
  };
};
