import { isRecord } from "@utils/guards";
import type { ValidationError } from "../schema";
import {
  DELIVERY_CAPS, DELIVERY_DIALOGUE, DELIVERY_RHYTHMS, DELIVERY_SHEET_KEYS, NARRATION_SHEET_KEYS, ROSTER_POLISH_KEYS,
  type DeliverySheet, type NarrationSheet, type RosterPolish,
} from "../deliverySchema";
import { MOOD_DEFAULT_VALUES } from "../lifeSchema";
import { addError, isOneOf, rejectUnknownKeys } from "./common";

export interface DeliveryContext {
  path: string;
  errors: ValidationError[];
  names?: readonly string[];
}

type ListKey = "prefer" | "avoid" | "tics";

const fold = (text: string) => text.trim().toLowerCase();

const readText = (value: unknown, cap: number, path: string, errors: ValidationError[]): string | undefined => {
  if (value === undefined) return undefined;
  if (typeof value !== "string") { addError(errors, path, "must be text"); return undefined; }
  const text = value.trim();
  if (text.length > cap) addError(errors, path, `at most ${cap} characters (has ${text.length})`);
  return text || undefined;
};

const readList = (value: unknown, key: ListKey, ctx: DeliveryContext): string[] | undefined => {
  if (value === undefined) return undefined;
  const path = `${ctx.path}.${key}`;
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) { addError(ctx.errors, path, "must be a list of words or short phrases"); return undefined; }
  const cap = DELIVERY_CAPS[key];
  const seen = new Set<string>();
  const kept = (value as string[]).map((item) => item.trim()).filter((item) => item && !seen.has(fold(item)) && Boolean(seen.add(fold(item))));
  if (kept.length > cap.items) addError(ctx.errors, path, `at most ${cap.items} entries (has ${kept.length})`);
  kept.forEach((item, index) => { if (item.length > cap.chars) addError(ctx.errors, `${path}.${index}`, `at most ${cap.chars} characters (has ${item.length})`); });
  return kept.length ? kept : undefined;
};

const checkNames = (sheet: DeliverySheet, ctx: DeliveryContext) => {
  const names = new Set((ctx.names ?? []).map(fold).filter(Boolean));
  (["tics", "avoid"] as const).forEach((key) => (sheet[key] ?? []).forEach((item, index) => {
    if (names.has(fold(item))) addError(ctx.errors, `${ctx.path}.${key}.${index}`, `'${item}' is a character's or entity's name; a voice sheet never steers names`);
  }));
};

const checkOverlap = (sheet: DeliverySheet, ctx: DeliveryContext) => {
  const avoid = new Set((sheet.avoid ?? []).map(fold));
  (sheet.prefer ?? []).forEach((item, index) => {
    if (avoid.has(fold(item))) addError(ctx.errors, `${ctx.path}.prefer.${index}`, `'${item}' is in both prefer and avoid`);
  });
};

const compact = <T extends object>(value: T): T | undefined => {
  const kept = Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined)) as T;
  return Object.keys(kept).length ? kept : undefined;
};

const sheetFields = (raw: Record<string, unknown>, ctx: DeliveryContext): DeliverySheet => {
  const rhythm = raw.rhythm === undefined ? undefined : isOneOf(raw.rhythm, DELIVERY_RHYTHMS) ? raw.rhythm : undefined;
  if (raw.rhythm !== undefined && rhythm === undefined) addError(ctx.errors, `${ctx.path}.rhythm`, `rhythm must be one of ${DELIVERY_RHYTHMS.join(", ")}`);
  const sheet: DeliverySheet = {
    notes: readText(raw.notes, DELIVERY_CAPS.notes, `${ctx.path}.notes`, ctx.errors),
    prefer: readList(raw.prefer, "prefer", ctx),
    avoid: readList(raw.avoid, "avoid", ctx),
    tics: readList(raw.tics, "tics", ctx),
    rhythm,
  };
  checkOverlap(sheet, ctx);
  checkNames(sheet, ctx);
  return sheet;
};

export const readDeliverySheet = (raw: unknown, ctx: DeliveryContext): DeliverySheet | undefined => {
  if (raw === undefined) return undefined;
  if (!isRecord(raw)) { addError(ctx.errors, ctx.path, "a voice sheet must be an object"); return undefined; }
  rejectUnknownKeys(raw, DELIVERY_SHEET_KEYS, ctx.path, ctx.errors);
  return compact(sheetFields(raw, ctx));
};

const moodValues = (member: unknown): string[] | null => {
  if (!isRecord(member) || !isRecord(member.mood)) return null;
  if (member.mood.values === undefined) return [...MOOD_DEFAULT_VALUES];
  return Array.isArray(member.mood.values) ? member.mood.values.filter((value): value is string => typeof value === "string") : null;
};

const readByMood = (value: unknown, member: unknown, ctx: DeliveryContext): Record<string, string> | undefined => {
  if (value === undefined) return undefined;
  const path = `${ctx.path}.by_mood`;
  if (!isRecord(value)) { addError(ctx.errors, path, "by_mood is an object of mood value to text"); return undefined; }
  const moods = moodValues(member);
  if (!moods) { addError(ctx.errors, path, "by_mood needs the character's mood (roster[].mood under character life)"); return undefined; }
  const kept: Record<string, string> = {};
  Object.entries(value).forEach(([mood, text]) => {
    if (!moods.includes(mood)) { addError(ctx.errors, `${path}.${mood}`, `'${mood}' is not one of this character's moods (${moods.join(", ")})`); return; }
    const line = readText(text, DELIVERY_CAPS.byMood, `${path}.${mood}`, ctx.errors);
    if (line) kept[mood] = line;
  });
  return Object.keys(kept).length ? kept : undefined;
};

export const readRosterPolish = (raw: unknown, member: unknown, ctx: DeliveryContext): RosterPolish | undefined => {
  if (raw === undefined) return undefined;
  if (!isRecord(raw)) { addError(ctx.errors, ctx.path, "polish must be an object"); return undefined; }
  rejectUnknownKeys(raw, ROSTER_POLISH_KEYS, ctx.path, ctx.errors);
  if (raw.dialogue !== undefined && !isOneOf(raw.dialogue, DELIVERY_DIALOGUE)) addError(ctx.errors, `${ctx.path}.dialogue`, "dialogue must be keep or voice");
  if (raw.enabled !== undefined && typeof raw.enabled !== "boolean") addError(ctx.errors, `${ctx.path}.enabled`, "enabled must be true or false");
  const sheet = sheetFields(raw, ctx);
  const polish = compact<RosterPolish>({
    ...sheet,
    by_mood: readByMood(raw.by_mood, member, ctx),
    dialogue: isOneOf(raw.dialogue, DELIVERY_DIALOGUE) ? raw.dialogue : undefined,
  });
  if (!polish) return undefined;
  return raw.enabled === false ? { ...polish, enabled: false } : polish;
};

export const readNarrationSheet = (raw: unknown, ctx: DeliveryContext): NarrationSheet | undefined => {
  if (raw === undefined) return undefined;
  if (!isRecord(raw)) { addError(ctx.errors, ctx.path, "the narration sheet must be an object"); return undefined; }
  (["by_mood", "dialogue", "enabled"] as const).filter((key) => raw[key] !== undefined)
    .forEach((key) => addError(ctx.errors, `${ctx.path}.${key}`, `the narration sheet has no ${key}; it belongs to a cast member's polish`));
  rejectUnknownKeys(Object.fromEntries(Object.entries(raw).filter(([key]) => !["by_mood", "dialogue", "enabled"].includes(key))), NARRATION_SHEET_KEYS, ctx.path, ctx.errors);
  return compact(sheetFields(raw, ctx));
};

const textsOf = (value: unknown): string[] => (typeof value === "string" ? [value] : Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : []);

export const deliveryNames = (json: { roster?: unknown; codex?: unknown }): string[] => {
  const roster = Array.isArray(json.roster) ? json.roster.filter(isRecord) : [];
  const codex = isRecord(json.codex) ? Object.values(json.codex).flatMap((page) => (Array.isArray(page) ? page.filter(isRecord) : [])) : [];
  return [...roster, ...codex].flatMap((entry) => [...textsOf(entry.name), ...textsOf(entry.id), ...textsOf(entry.aliases)]).map((name) => name.trim()).filter(Boolean);
};
