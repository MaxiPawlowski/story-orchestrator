import {
  QUALITY_SOURCES, EVIDENCE_FROM, QUALITY_TYPES, TENSION_CURRENT_KEY, type Checkpoint, type Quality,
  type QualityCriterion, type QualityRatingLevel, type ValidationError,
} from "../schema";
import { QUALITY_READ_AS, ratingLevels, READ_AS_TYPES } from "../qualityRead";
import { progressQualityForAnchor } from "../convergence";
import { isRecord } from "@utils/guards";
import { addError, asString, isOneOf } from "./common";

const readCriterion = (value: unknown): string | QualityCriterion | null => {
  if (typeof value === "string") return value.trim() || null;
  if (!isRecord(value) || typeof value.what !== "string" || !value.what.trim()) return null;
  const examples = Array.isArray(value.examples) ? value.examples.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0) : [];
  return { what: value.what.trim(), ...(typeof value.not_for === "string" && value.not_for.trim() ? { not_for: value.not_for.trim() } : {}), ...(examples.length ? { examples } : {}) };
};

const readEvidenceFrom = (value: Record<string, unknown>, source: Quality["source"], path: string, errors: ValidationError[]): Pick<Quality, "evidence_from"> => {
  if (value.evidence_from === undefined) return {};
  if (!isOneOf(value.evidence_from, EVIDENCE_FROM)) {
    addError(errors, `${path}.evidence_from`, "evidence_from must be any or world");
    return {};
  }
  if (source !== "extractor") {
    addError(errors, `${path}.evidence_from`, "only extractor qualities read evidence");
    return {};
  }
  return { evidence_from: value.evidence_from };
};

// v2.2 plan 06: `read_as` + `criteria`. A hint that cannot work is an error, never a silent no-op.
const readQualityRead = (value: Record<string, unknown>, type: Quality["type"], source: Quality["source"], rubric: string, values: string[] | undefined, path: string, errors: ValidationError[]): Pick<Quality, "read_as" | "criteria"> => {
  if (value.read_as === undefined) {
    if (value.criteria !== undefined) addError(errors, `${path}.criteria`, "criteria need a read_as hint");
    return {};
  }
  if (!isOneOf(value.read_as, QUALITY_READ_AS)) {
    addError(errors, `${path}.read_as`, "read_as must be choice, stated or rating");
    return {};
  }
  const readAs = value.read_as;
  if (source !== "extractor") addError(errors, `${path}.read_as`, "only extractor qualities can be read by the judge");
  if (!READ_AS_TYPES[readAs].includes(type)) addError(errors, `${path}.read_as`, `read_as ${readAs} does not fit a ${type} quality`);
  if (value.criteria === undefined) {
    if (readAs === "rating" && !ratingLevels({ rubric })) addError(errors, `${path}.criteria`, "a rating needs criteria.levels or a rubric that reads \"from N (low) to M (high)\", for example \"from 1 (barely) to 5 (completely)\"");
    return { read_as: readAs };
  }
  if (!isRecord(value.criteria)) {
    addError(errors, `${path}.criteria`, "criteria must be an object");
    return { read_as: readAs };
  }
  if (readAs === "rating") {
    const levels = Array.isArray(value.criteria.levels)
      ? value.criteria.levels.filter((level): level is QualityRatingLevel => isRecord(level) && typeof level.value === "number" && typeof level.label === "string" && level.label.trim().length > 0)
      : [];
    if (levels.length < 2) addError(errors, `${path}.criteria.levels`, "a rating needs at least two levels with a number value and a label");
    return levels.length >= 2 ? { read_as: readAs, criteria: { levels } } : { read_as: readAs };
  }
  if (readAs === "stated") {
    addError(errors, `${path}.criteria`, "a stated quality takes no criteria: its options are found in the text");
    return { read_as: readAs };
  }
  const allowed = new Set(type === "bool" ? ["true", "false"] : values ?? []);
  const criteria: Record<string, string | QualityCriterion> = {};
  Object.entries(value.criteria).forEach(([option, raw]) => {
    if (!allowed.has(option)) {
      addError(errors, `${path}.criteria.${option}`, `'${option}' is not ${type === "bool" ? "true or false" : "one of the enum values"}`);
      return;
    }
    const criterion = readCriterion(raw);
    if (!criterion) addError(errors, `${path}.criteria.${option}`, "a criterion is text or { what, not_for?, examples? }");
    else criteria[option] = criterion;
  });
  return { read_as: readAs, ...(Object.keys(criteria).length ? { criteria } : {}) };
};

export const readQuality = (value: unknown, path: string, errors: ValidationError[]): Quality | null => {
  if (!isRecord(value)) {
    addError(errors, path, "quality must be an object");
    return null;
  }

  const key = asString(value.key);
  const type = isOneOf(value.type, QUALITY_TYPES) ? value.type : null;
  const source = isOneOf(value.source, QUALITY_SOURCES) ? value.source : null;
  const rubric = asString(value.rubric);

  if (!key) addError(errors, `${path}.key`, "quality key is required");
  if (!type) addError(errors, `${path}.type`, "quality type is invalid");
  if (!source) addError(errors, `${path}.source`, "quality source is invalid");
  if (!rubric) addError(errors, `${path}.rubric`, "quality rubric is required");

  if (!key || !type || !source || !rubric) return null;

  const values = Array.isArray(value.values) ? value.values.filter((entry): entry is string => typeof entry === "string") : undefined;
  if (type === "enum" && (!values || values.length === 0)) {
    addError(errors, `${path}.values`, "enum qualities require values");
    return null;
  }
  if (type !== "enum" && values?.length) {
    addError(errors, `${path}.values`, "values are only valid for enum qualities");
    return null;
  }
  if (source === "code" && isRecord(value.ledger_binding)) {
    addError(errors, `${path}.ledger_binding`, "code qualities cannot bind to ledger fields");
    return null;
  }

  const ledgerBinding = isRecord(value.ledger_binding)
    && typeof value.ledger_binding.entity === "string"
    && typeof value.ledger_binding.field === "string"
    ? { entity: value.ledger_binding.entity, field: value.ledger_binding.field }
    : undefined;

  return {
    key,
    type,
    source,
    rubric,
    ...(values ? { values } : {}),
    ...(typeof value.latching === "boolean" ? { latching: value.latching } : {}),
    ...(typeof value.monotonic === "boolean" ? { monotonic: value.monotonic } : {}),
    ...(isRecord(value.scope_hint) ? { scope_hint: value.scope_hint as Quality["scope_hint"] } : {}),
    ...(ledgerBinding ? { ledger_binding: ledgerBinding } : {}),
    ...readQualityRead(value, type, source, rubric, values, path, errors),
    ...readEvidenceFrom(value, source, path, errors),
  };
};

export const addProgressQualities = (qualities: Quality[], checkpoints: Checkpoint[], errors: ValidationError[]) => {
  const used = new Set(qualities.map((quality) => quality.key));
  const next = [...qualities];
  checkpoints.filter((checkpoint) => checkpoint.type === "anchor").forEach((anchor) => {
    const key = progressQualityForAnchor(anchor.id);
    const existing = next.find((quality) => quality.key === key);
    if (existing) {
      if (existing.source !== "code" || existing.type !== "float" || !existing.monotonic) {
        addError(errors, `qualities.${key}`, "progress qualities must be code float monotonic");
      }
      return;
    }
    if (!used.has(key)) {
      used.add(key);
      next.push({ key, type: "float", source: "code", monotonic: true, rubric: `Code-set convergence progress toward ${anchor.id}` });
    }
  });
  return next;
};

export const addBuiltinTensionQuality = (qualities: Quality[], errors: ValidationError[]) => {
  const existing = qualities.find((quality) => quality.key === TENSION_CURRENT_KEY);
  if (existing) {
    if (existing.type !== "float" || existing.source !== "extractor") {
      addError(errors, `qualities.${TENSION_CURRENT_KEY}`, "tension_current must be an extractor float quality");
    }
    return qualities;
  }
  return [...qualities, {
    key: TENSION_CURRENT_KEY,
    type: "float" as const,
    source: "extractor" as const,
    rubric: "Current dramatic tension, read as a named level and smoothed into a 0-1 value",
  }];
};
