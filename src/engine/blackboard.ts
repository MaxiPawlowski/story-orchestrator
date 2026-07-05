import type { NormalizedStoryV2, PrimitiveValue, Quality, QualitySource } from "./schema";

export interface BlackboardDelta {
  q: string;
  v: PrimitiveValue;
  source?: QualitySource;
  strictUnlatch?: boolean;
}

export type ApplyOutcome =
  | { ok: true; key: string; previous: PrimitiveValue | undefined; value: PrimitiveValue; version: number }
  | { ok: false; key: string; reason: string };

export interface BlackboardSnapshot {
  values: Record<string, PrimitiveValue>;
  versions: Record<string, number>;
  latched: Record<string, boolean>;
}

const cloneRecord = <T>(value: Record<string, T>): Record<string, T> => ({ ...value });

const valueMatchesQuality = (quality: Quality, value: PrimitiveValue): boolean => {
  if (quality.type === "bool") return typeof value === "boolean";
  if (quality.type === "string") return typeof value === "string";
  if (quality.type === "enum") return typeof value === "string" && Boolean(quality.values?.includes(value));
  if (quality.type === "float") return typeof value === "number" && Number.isFinite(value);
  return typeof value === "number" && Number.isInteger(value);
};

export class Blackboard {
  private values: Record<string, PrimitiveValue> = {};
  private versions: Record<string, number> = {};
  private latched: Record<string, boolean> = {};

  constructor(private readonly story: Pick<NormalizedStoryV2, "qualityByKey">, snapshot?: BlackboardSnapshot) {
    if (snapshot) this.restore(snapshot);
  }

  get(key: string): PrimitiveValue | undefined {
    return this.values[key];
  }

  getVersion(key: string): number {
    return this.versions[key] ?? 0;
  }

  get blackboardVersionSum(): number {
    return Object.values(this.versions).reduce((sum, version) => sum + version, 0);
  }

  entries(): Record<string, PrimitiveValue> {
    return cloneRecord(this.values);
  }

  applyDelta(delta: BlackboardDelta): ApplyOutcome {
    const quality = this.story.qualityByKey[delta.q];
    if (!quality) return { ok: false, key: delta.q, reason: "unknown quality" };
    if (delta.source && delta.source !== quality.source) return { ok: false, key: delta.q, reason: "source mismatch" };
    if (!valueMatchesQuality(quality, delta.v)) return { ok: false, key: delta.q, reason: "type mismatch" };

    const previous = this.values[delta.q];
    if (quality.monotonic && typeof previous === "number" && typeof delta.v === "number" && delta.v < previous) {
      return { ok: false, key: delta.q, reason: "monotonic decrease" };
    }
    if (quality.latching && this.latched[delta.q] && previous !== delta.v && !delta.strictUnlatch) {
      return { ok: false, key: delta.q, reason: "latched value change" };
    }

    this.values[delta.q] = delta.v;
    this.versions[delta.q] = (this.versions[delta.q] ?? 0) + 1;
    if (quality.latching && (quality.type !== "bool" || delta.v === true)) this.latched[delta.q] = true;
    return { ok: true, key: delta.q, previous, value: delta.v, version: this.versions[delta.q] };
  }

  snapshot(): BlackboardSnapshot {
    return {
      values: cloneRecord(this.values),
      versions: cloneRecord(this.versions),
      latched: cloneRecord(this.latched),
    };
  }

  restore(snapshot: BlackboardSnapshot): void {
    this.values = cloneRecord(snapshot.values);
    this.versions = cloneRecord(snapshot.versions);
    this.latched = cloneRecord(snapshot.latched);
  }
}
