import type { NormalizedStoryV2, PrimitiveValue, Quality, QualitySource } from "./schema";

export interface BlackboardDelta {
  q: string;
  v: PrimitiveValue;
  source?: QualitySource;
  strictUnlatch?: boolean;
  writer?: "card-entry" | "extractor" | "manual";
  boundary?: number;
  evidenceAt?: number;
}

export type ApplyOutcome =
  | { ok: true; key: string; previous: PrimitiveValue | undefined; value: PrimitiveValue; version: number }
  | { ok: false; key: string; reason: string };

export interface BlackboardSnapshot {
  values: Record<string, PrimitiveValue>;
  versions: Record<string, number>;
  latched: Record<string, boolean>;
  writerOf?: Record<string, { writer: "card-entry" | "extractor" | "manual"; boundary: number }>;
  authoredAt?: Record<string, number>;
}

const cloneRecord = <T>(value: Record<string, T>): Record<string, T> => ({ ...value });

export const qualityAccepts = (quality: Pick<Quality, "type" | "values">, value: PrimitiveValue): boolean => {
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
  private writerOf: NonNullable<BlackboardSnapshot["writerOf"]> = {};
  private authoredAt: Record<string, number> = {};
  private writeBoundary = 0;
  private writeMessage = -1;

  constructor(private readonly story: Pick<NormalizedStoryV2, "qualityByKey" | "cardFieldByQuality">, snapshot?: BlackboardSnapshot) {
    if (snapshot) this.restore(snapshot);
    else this.seed();
  }

  private seed(): void {
    for (const quality of Object.values(this.story.qualityByKey)) {
      const start = quality.step_rule?.start;
      if (start !== undefined && this.values[quality.key] === undefined) this.values[quality.key] = start;
    }
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
    if (this.story.cardFieldByQuality?.[delta.q] && typeof delta.v === "string" && delta.v.length > 240) {
      return { ok: false, key: delta.q, reason: "card field exceeds 240 characters" };
    }
    if (delta.writer === "card-entry" && !this.story.cardFieldByQuality?.[delta.q]) return { ok: false, key: delta.q, reason: "writer not permitted" };
    if (delta.source && delta.source !== quality.source) return { ok: false, key: delta.q, reason: "source mismatch" };
    if (!qualityAccepts(quality, delta.v)) return { ok: false, key: delta.q, reason: "type mismatch" };

    const previous = this.values[delta.q];
    if (quality.monotonic && typeof previous === "number" && typeof delta.v === "number" && delta.v < previous) {
      return { ok: false, key: delta.q, reason: "monotonic decrease" };
    }
    if (quality.latching && this.latched[delta.q] && previous !== delta.v && !delta.strictUnlatch) {
      return { ok: false, key: delta.q, reason: "latched value change" };
    }

    this.values[delta.q] = delta.v;
    if (delta.writer === "manual") this.authoredAt[delta.q] = this.writeMessage;
    if (this.story.cardFieldByQuality?.[delta.q]) this.writerOf[delta.q] = { writer: delta.writer ?? "extractor", boundary: delta.boundary ?? this.writeBoundary };
    this.versions[delta.q] = (this.versions[delta.q] ?? 0) + 1;
    if (quality.latching && (quality.type !== "bool" || delta.v === true)) this.latched[delta.q] = true;
    return { ok: true, key: delta.q, previous, value: delta.v, version: this.versions[delta.q] };
  }

  readBeforeAuthor(delta: BlackboardDelta, readTo: number | undefined): boolean {
    const evidence = delta.evidenceAt ?? readTo;
    const authored = this.authoredAt[delta.q];
    return delta.writer !== "manual" && authored !== undefined && evidence !== undefined && evidence <= authored;
  }

  holdsAgainst(earlier: BlackboardDelta, later: BlackboardDelta): boolean {
    const quality = this.story.qualityByKey[earlier.q];
    if (!quality || earlier.q !== later.q || later.strictUnlatch) return false;
    if (quality.monotonic && typeof earlier.v === "number" && typeof later.v === "number" && later.v < earlier.v) return true;
    return Boolean(quality.latching && (quality.type !== "bool" || earlier.v === true) && later.v !== earlier.v);
  }

  // Author recovery only: clear a latched value (or set it) without the latch/monotonic guards, and
  // always bump the version so the apply queue's drift check still sees a change. Used by
  // resetQuality and the step-back recovery, never by an extraction path.
  override(key: string, value: PrimitiveValue | undefined): void {
    delete this.latched[key];
    delete this.authoredAt[key];
    this.versions[key] = (this.versions[key] ?? 0) + 1;
    if (value === undefined) delete this.values[key];
    else this.values[key] = value;
    this.seed();
    if (this.story.cardFieldByQuality?.[key]) {
      if (value === undefined) delete this.writerOf[key];
      else this.writerOf[key] = { writer: "manual", boundary: this.writeBoundary };
    }
  }

  snapshot(): BlackboardSnapshot {
    return {
      values: cloneRecord(this.values),
      versions: cloneRecord(this.versions),
      latched: cloneRecord(this.latched),
      ...(Object.keys(this.writerOf).length ? { writerOf: Object.fromEntries(Object.entries(this.writerOf).map(([key, value]) => [key, { ...value }])) } : {}),
      ...(Object.keys(this.authoredAt).length ? { authoredAt: cloneRecord(this.authoredAt) } : {}),
    };
  }

  restore(snapshot: BlackboardSnapshot): void {
    this.values = cloneRecord(snapshot.values);
    this.versions = cloneRecord(snapshot.versions);
    this.latched = cloneRecord(snapshot.latched);
    this.writerOf = Object.fromEntries(Object.entries(snapshot.writerOf ?? {}).map(([key, value]) => [key, { ...value }]));
    this.authoredAt = cloneRecord(snapshot.authoredAt ?? {});
    this.seed();
  }

  setWriteBoundary(boundary: number, messageId?: number): void {
    this.writeBoundary = boundary;
    if (messageId !== undefined) this.writeMessage = messageId;
  }
}
