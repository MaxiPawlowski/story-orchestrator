// A host effect, and what it did to a shared resource.
//
// `target` is a STABLE identity, never a display name: a group member is its chid, a World Info
// entry is its book's file id and uid, the Author's Note is a slot, a background is the file ST
// actually selected, a preset is its name plus the backend it was applied to.
export const EFFECT_LEDGER_LIMIT = 200;

export type EffectLedgerStatus = "pending" | "applied" | "failed" | "reverted" | "revert-failed" | "externally-changed";

export type EffectTarget =
  | { kind: "cast"; group: string; member: string }
  | { kind: "wi"; book: string; uid: number | null; entry: string }
  | { kind: "an" }
  | { kind: "background" }
  | { kind: "preset"; name: string; api: string }
  | { kind: "extension"; name: string };

const EFFECT_ORIGIN_KINDS = ["quest", "agenda", "complication"] as const;
export type EffectOriginKind = (typeof EFFECT_ORIGIN_KINDS)[number];

export interface EffectOrigin {
  kind: EffectOriginKind;
  id: string;
  boundary: number;
  messageId: number;
}

export interface EffectLedgerRow {
  id: string;
  effect: string;
  target: EffectTarget;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  checkpointId: string | null;
  boundary: number;
  messageId: number;
  at: string;
  status: EffectLedgerStatus;
  /** Why it failed, or what the host said instead of what we wrote. */
  reason?: string;
  /** Compare-and-set, applied here: what a revert found instead of `after`. */
  found?: Record<string, unknown> | null;
  origin?: EffectOrigin;
}

export interface EffectsRuntimeState {
  ledger: EffectLedgerRow[];
  /** This chat's own cast, mirrored per chat. The group is never the truth. */
  cast: Array<{ member: string; disabled: boolean }>;
}
