import type { PrimitiveValue, Quality, QualityRatingLevel, QualityStepRule } from "@engine/index";
import { evidenceCut, type EvidenceCut } from "./evidenceCut";
import type { ParsedDelta } from "./types";

export interface HeldRatingDelta extends EvidenceCut {
  key: string;
  value: string;
  evidence: string;
  reason: string;
}

export interface RatingGuardResult {
  accepted: ParsedDelta[];
  held: HeldRatingDelta[];
}

interface RatingRule {
  levels: QualityRatingLevel[];
  monotonic: boolean;
}

const ratingRule = (quality: Quality | undefined): RatingRule | null => {
  if (quality?.read_as !== "rating") return null;
  const criteria = quality.criteria;
  const levels = criteria && "levels" in criteria && Array.isArray(criteria.levels) && criteria.levels.length >= 2 ? criteria.levels : null;
  return levels ? { levels, monotonic: Boolean(quality.monotonic) } : null;
};

const levelName = (level: QualityRatingLevel) => level.label.split(":")[0].trim();

const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const names = (evidence: string, name: string) => new RegExp(`(^|[^\\p{L}\\p{N}])${escape(name)}($|[^\\p{L}\\p{N}])`, "iu").test(evidence);

const lowest = (levels: QualityRatingLevel[]) => Math.min(...levels.map((entry) => entry.value));

const rises = (rule: RatingRule, value: number, current: PrimitiveValue | undefined): boolean =>
  rule.monotonic || value > (typeof current === "number" ? Math.max(current, lowest(rule.levels)) : lowest(rule.levels));

const refusal = (rule: RatingRule, value: PrimitiveValue, current: PrimitiveValue | undefined, evidence: string): string | null => {
  const level = rule.levels.find((entry) => entry.value === value);
  if (!level || typeof value !== "number" || !rises(rule, value, current)) return null;
  if (!names(evidence, levelName(level))) return `the evidence never names ${levelName(level)}`;
  if (typeof current !== "number") return null;
  const next = rule.levels.map((entry) => entry.value).filter((entry) => entry > current).sort((left, right) => left - right)[0];
  return next !== undefined && value > next ? `skips from ${current} past the next level` : null;
};

const stepped = (rule: QualityStepRule, quality: Quality, value: PrimitiveValue, current: PrimitiveValue | undefined): PrimitiveValue => {
  if (rule.cycle) {
    const values = quality.values ?? [];
    const at = typeof current === "string" ? values.indexOf(current) : -1;
    return at < 0 || value === current || !values.includes(String(value)) ? value : values[(at + 1) % values.length];
  }
  if (typeof value !== "number") return value;
  const from = typeof current === "number" ? current : rule.start ?? value;
  const moved = Math.max(from - rule.step, Math.min(from + rule.step, value));
  return Math.max(rule.min ?? moved, Math.min(rule.max ?? moved, moved));
};

export const applyStepRule = (quality: Quality | undefined, delta: ParsedDelta, current: PrimitiveValue | undefined): ParsedDelta => {
  if (!quality?.step_rule) return delta;
  const value = stepped(quality.step_rule, quality, delta.delta.v, current);
  return value === delta.delta.v ? delta : { ...delta, delta: { ...delta.delta, v: value } };
};

export const applyRatingGrounding = (
  qualityByKey: Record<string, Quality>,
  values: Record<string, PrimitiveValue>,
  deltas: ParsedDelta[],
): RatingGuardResult => {
  const accepted: ParsedDelta[] = [];
  const held: HeldRatingDelta[] = [];
  for (const raw of deltas) {
    const quality = qualityByKey[raw.delta.q];
    const delta = applyStepRule(quality, raw, values[raw.delta.q]);
    const rule = quality?.step_rule ? null : ratingRule(quality);
    const reason = rule ? refusal(rule, delta.delta.v, values[delta.delta.q], delta.evidence ?? "") : null;
    if (reason) held.push({ key: delta.delta.q, value: String(delta.delta.v), evidence: delta.evidence ?? "", reason, ...evidenceCut(delta) });
    else accepted.push(delta);
  }
  return { accepted, held };
};
