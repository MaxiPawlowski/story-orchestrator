import { GATE_OPERATORS, TENSION_LEVELS, type GateNode, type GateOperator, type NormalizedStoryV2, type PrimitiveValue, type Quality, type ScaffoldingDelta } from "@engine/index";
import type { CriticVerdict, GeneratedBeat, GeneratedOutcome } from "./types";

const isRecord = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === "object" && !Array.isArray(value);
const isPrimitive = (value: unknown): value is PrimitiveValue => typeof value === "string" || typeof value === "number" || typeof value === "boolean";

const normalizeJsonText = (raw: string) => {
  const trimmed = raw.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  if (fenced) return fenced[1].trim();
  const embedded = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  return embedded ? embedded[1].trim() : trimmed;
};

const valueMatches = (quality: Quality, value: PrimitiveValue) => {
  if (quality.type === "bool") return typeof value === "boolean";
  if (quality.type === "string") return typeof value === "string";
  if (quality.type === "enum") return typeof value === "string" && Boolean(quality.values?.includes(value));
  if (quality.type === "float") return typeof value === "number" && Number.isFinite(value);
  return typeof value === "number" && Number.isInteger(value);
};

const coerceValue = (quality: Quality | undefined, value: PrimitiveValue): PrimitiveValue => {
  if (!quality || typeof value !== "string") return value;
  if (quality.type === "bool" && /^(true|false)$/i.test(value)) return value.toLowerCase() === "true";
  if ((quality.type === "int" || quality.type === "float") && value.trim() !== "" && Number.isFinite(Number(value))) return Number(value);
  return value;
};

const readGate = (value: unknown, story: NormalizedStoryV2, path: string, issues: string[]): GateNode | null => {
  if (!isRecord(value)) {
    issues.push(`${path}: gate must be an object`);
    return null;
  }
  if ("q" in value || "op" in value || "v" in value) {
    if (typeof value.q !== "string" || !story.qualityByKey[value.q]) issues.push(`${path}.q: unknown quality`);
    if (typeof value.op !== "string" || !(GATE_OPERATORS as readonly string[]).includes(value.op)) issues.push(`${path}.op: invalid operator`);
    if (!isPrimitive(value.v) && !(Array.isArray(value.v) && value.v.every(isPrimitive))) issues.push(`${path}.v: invalid value`);
    if (typeof value.q !== "string" || typeof value.op !== "string" || !(GATE_OPERATORS as readonly string[]).includes(value.op) || (!isPrimitive(value.v) && !(Array.isArray(value.v) && value.v.every(isPrimitive)))) return null;
    const quality = story.qualityByKey[value.q];
    const v = Array.isArray(value.v) ? value.v.map((entry) => coerceValue(quality, entry as PrimitiveValue)) : coerceValue(quality, value.v as PrimitiveValue);
    return { q: value.q, op: value.op as GateOperator, v };
  }
  if (Array.isArray(value.all)) return { all: value.all.map((entry, index) => readGate(entry, story, `${path}.all.${index}`, issues)).filter((entry): entry is GateNode => Boolean(entry)) };
  if (Array.isArray(value.any)) return { any: value.any.map((entry, index) => readGate(entry, story, `${path}.any.${index}`, issues)).filter((entry): entry is GateNode => Boolean(entry)) };
  if ("not" in value) {
    const not = readGate(value.not, story, `${path}.not`, issues);
    return not ? { not } : null;
  }
  issues.push(`${path}: invalid gate`);
  return null;
};

const readDeltas = (value: unknown, story: NormalizedStoryV2, path: string, issues: string[]): ScaffoldingDelta[] | undefined => {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) {
    issues.push(`${path}: deltas must be an array`);
    return undefined;
  }
  return value.map((entry, index) => {
    const entryPath = `${path}.${index}`;
    if (!isRecord(entry) || typeof entry.q !== "string" || !isPrimitive(entry.v)) {
      issues.push(`${entryPath}: invalid delta`);
      return null;
    }
    const quality = story.qualityByKey[entry.q];
    const v = coerceValue(quality, entry.v);
    if (!quality || !valueMatches(quality, v)) {
      issues.push(`${entryPath}: invalid delta value`);
      return null;
    }
    return { q: entry.q, v };
  }).filter((entry): entry is ScaffoldingDelta => Boolean(entry));
};

const readOutcome = (value: unknown, story: NormalizedStoryV2, path: string, issues: string[]): GeneratedOutcome | null => {
  if (!isRecord(value)) {
    issues.push(`${path}: outcome must be an object`);
    return null;
  }
  const gateIssues: string[] = [];
  const gate = readGate(value.gate, story, `${path}.gate`, gateIssues);
  issues.push(...gateIssues);
  if (typeof value.label !== "string" || !value.label.trim()) issues.push(`${path}.label: required`);
  const deltas = readDeltas(value.deltas, story, `${path}.deltas`, issues);
  const progress = isRecord(value.progress) && typeof value.progress.anchor === "string" && typeof value.progress.amount === "number"
    ? { anchor: value.progress.anchor, amount: value.progress.amount }
    : undefined;
  if (progress && !story.checkpointById[progress.anchor]) issues.push(`${path}.progress.anchor: unknown anchor`);
  if (!gate || typeof value.label !== "string") return null;
  return { label: value.label, gate, ...(deltas ? { deltas } : {}), ...(progress ? { progress } : {}) };
};

export function parseGeneratedBeats(raw: string, story: NormalizedStoryV2): { beats: GeneratedBeat[]; issues: string[] } {
  const issues: string[] = [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(normalizeJsonText(raw));
  } catch (error) {
    return { beats: [], issues: [error instanceof Error ? error.message : "Invalid JSON"] };
  }
  const source = isRecord(parsed) && Array.isArray(parsed.beats) ? parsed.beats : parsed;
  if (!Array.isArray(source)) return { beats: [], issues: ["response must be an array or { beats }"] };
  const beats = source.map((entry, index) => {
    const path = `beats.${index}`;
    if (!isRecord(entry)) {
      issues.push(`${path}: beat must be an object`);
      return null;
    }
    const objective = typeof entry.objective === "string" ? entry.objective : "";
    const guidance = typeof entry.guidance === "string" ? entry.guidance : "";
    const tension = typeof entry.tension_target === "string" && (TENSION_LEVELS as readonly string[]).includes(entry.tension_target) ? entry.tension_target : null;
    if (!objective.trim()) issues.push(`${path}.objective: required`);
    if (!guidance.trim()) issues.push(`${path}.guidance: required`);
    if (!tension) issues.push(`${path}.tension_target: invalid`);
    if (!Array.isArray(entry.outcomes) || !entry.outcomes.length) issues.push(`${path}.outcomes: required`);
    const outcomes = Array.isArray(entry.outcomes) ? entry.outcomes.map((outcome, outcomeIndex) => readOutcome(outcome, story, `${path}.outcomes.${outcomeIndex}`, issues)).filter((outcome): outcome is GeneratedOutcome => Boolean(outcome)) : [];
    if (!objective || !guidance || !tension || !outcomes.length) return null;
    return { objective, guidance, tension_target: tension, outcomes };
  }).filter((entry): entry is GeneratedBeat => Boolean(entry));
  return { beats, issues };
}

export function parseCriticVerdict(raw: string): CriticVerdict {
  try {
    const parsed = JSON.parse(normalizeJsonText(raw));
    if (isRecord(parsed)) {
      return {
        pass: parsed.pass === true,
        issues: Array.isArray(parsed.issues) ? parsed.issues.filter((entry): entry is string => typeof entry === "string") : [],
        raw,
      };
    }
  } catch {
    return { pass: false, issues: ["Invalid critic JSON"], raw };
  }
  return { pass: false, issues: ["Invalid critic verdict"], raw };
}
