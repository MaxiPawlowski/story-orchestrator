// v2.3 plan 05. One account of where a derived record came from and whether it is still valid, for
// every store that holds a claim about the transcript: memory entries, epistemic rows, ledger
// versions, scene fields. The consumers (injection, canon, the warden's fact list) read `validity`
// rather than trusting a row simply because it is present — a claim whose source message was
// removed, or one that contradicts another store, must not steer a reply.
export const PROVENANCE_SOURCES = ["extractor", "judge", "author", "code", "curator", "blackboard"] as const;
export type ProvenanceSource = typeof PROVENANCE_SOURCES[number];

export const VALIDITIES = ["live", "superseded", "source-removed", "conflicted", "quarantined"] as const;
export type Validity = typeof VALIDITIES[number];

export const PROVENANCE_SOURCE_LIST = PROVENANCE_SOURCES;
export const PROVENANCE_VALIDITY_LIST = VALIDITIES;
export const PROVENANCE_STORES = ["memory", "ledger", "epistemic", "scene", "blackboard"] as const;
export type ProvenanceStore = typeof PROVENANCE_STORES[number];

export interface ProvenanceInput {
  store: ProvenanceStore;
  id: string;
}

export interface Provenance {
  source: ProvenanceSource;
  messageId: number;
  boundary: number;
  /** Which pass produced it: "shared-read", "epistemic-pass", "store-anyway", "manual-edit", … */
  pass: string;
  /** The message's revision at read time, so an edit invalidates the claim (plan 03's identity). */
  sourceRevision?: number;
  /** Multi-input derivations name the rows they were built from. */
  inputs?: ProvenanceInput[];
  confidence?: number;
  /** Store anyway, a manual edit, a reconfirmation or a lock: what the author decided, and when. */
  override?: { by: "author"; at: string; boundary: number; from?: string };
  validity: Validity;
}

export interface Provenanced {
  provenance?: Provenance;
}

export interface ProvenanceInputSpec {
  source: ProvenanceSource;
  messageId: number;
  boundary: number;
  pass: string;
  sourceRevision?: number;
  inputs?: ProvenanceInput[];
  confidence?: number;
}

export function provenance(spec: ProvenanceInputSpec): Provenance {
  return {
    source: spec.source,
    messageId: Number.isFinite(spec.messageId) ? Math.floor(spec.messageId) : -1,
    boundary: Number.isFinite(spec.boundary) ? Math.floor(spec.boundary) : -1,
    pass: spec.pass,
    ...(spec.sourceRevision === undefined ? {} : { sourceRevision: spec.sourceRevision }),
    ...(spec.inputs?.length ? { inputs: spec.inputs.map((input) => ({ ...input })) } : {}),
    ...(spec.confidence === undefined ? {} : { confidence: spec.confidence }),
    validity: "live",
  };
}

/** v2.5 plan 11: the hydrate sanitizer keeps a row only when its envelope has this shape. */
export const isProvenance = (value: unknown): value is Provenance => {
  const found = value as Partial<Provenance> | null;
  return Boolean(found) && typeof found === "object" && (PROVENANCE_SOURCES as readonly unknown[]).includes(found?.source) && (VALIDITIES as readonly unknown[]).includes(found?.validity)
    && typeof found?.messageId === "number" && typeof found?.boundary === "number" && typeof found?.pass === "string";
};

/** A record that carries no envelope (a scene read written without one) is not quarantined, so absent reads as live. */
export function isLive(record: Provenanced): boolean {
  return !record.provenance || record.provenance.validity === "live";
}

export const isQuarantined = (record: Provenanced): boolean => Boolean(record.provenance) && !isLive(record);

export function withValidity(record: { provenance: Provenance }, validity: Validity): { provenance: Provenance } {
  return { provenance: { ...record.provenance, validity } };
}

/** The author decided this record is true: an override anchored to the boundary it was made at, and
 *  the reason it exists. Reconciled conflicts, Store-anyway rows and locks all take this shape. */
export function withOverride(record: { provenance: Provenance }, reason: string, at: string, boundary: number): { provenance: Provenance } {
  return { provenance: { ...record.provenance, source: "author", validity: "live", override: { by: "author", at, boundary, from: reason } } };
}

/** Undoing a decision — an unlocked row, a resolved conflict reopened: the envelope goes back to
 *  what it said before the author decided. An absent envelope stays absent. */
export function clearOverride(record: Provenanced): { provenance?: Provenance } {
  if (!record.provenance?.override) return {};
  const { override: _cleared, ...rest } = record.provenance;
  return { provenance: rest };
}

export function describeProvenance(record: Provenanced): string {
  const found = record.provenance;
  if (!found) return "unknown origin";
  const where = found.messageId >= 0 ? `message ${found.messageId}` : "before this chat";
  const override = found.override ? `, kept by you at boundary ${found.override.boundary}` : "";
  return `${found.source} · ${found.pass} · ${where} · ${found.validity}${override}`;
}

/** The short form an author-facing list shows: where a claim came from, or a STATED unknown when the
 *  read carries no envelope. One rule, both the Memory tab and the conflict queue, because two
 *  renderings of the same envelope is how one of them goes stale. */
export const originLabel = (found?: Provenance): string => (!found ? "origin unknown" : `${found.source} · ${found.pass}`);
