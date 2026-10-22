export const ABANDON_REASONS = [
  "generation-started", "player-sent", "chat-changed", "row-mutated", "generation-stopped", "deadline", "write-mismatch", "story-updated",
] as const;
export type AbandonReason = (typeof ABANDON_REASONS)[number];

import { withholds } from "../runtime/generationLifecycle";

export const INELIGIBLE_REASONS = ["player-row", "system-row", "thought-only", "stopped", "scripted", "impersonate", "no-row"] as const;
export type Ineligible = (typeof INELIGIBLE_REASONS)[number];

export const SCRIPTED_TYPES: ReadonlySet<string> = new Set(["command", "extension", "first_message"]);
export const CONTINUED_TYPES: ReadonlySet<string> = new Set(["continue", "appendFinal"]);

export interface PolishRow {
  mes?: unknown;
  is_user?: unknown;
  is_system?: unknown;
  name?: unknown;
  send_date?: unknown;
  swipe_id?: unknown;
}

export const rowIneligible = (row: PolishRow | null | undefined, type: unknown, stopped: boolean): Ineligible | null => {
  if (!row || typeof row !== "object" || typeof row.mes !== "string") return "no-row";
  if (row.is_user === true) return "player-row";
  if (row.is_system === true) return "system-row";
  if (withholds(type)) return "impersonate";
  if (typeof type === "string" && SCRIPTED_TYPES.has(type)) return "scripted";
  if (stopped) return "stopped";
  if (!row.mes.trim()) return "thought-only";
  return null;
};

export interface CandidateKey {
  chatId: string;
  id: number;
  sendDate: string;
  swipeId: number;
  startHash: string;
}

export interface PolishCandidate extends CandidateKey {
  findings: number;
  startedAt: number;
  deadlineAt: number;
  abandoned: AbandonReason | null;
}

export type LedgerEvent =
  | { kind: "generation-started"; chatId: string; dryRun?: boolean }
  | { kind: "player-sent" }
  | { kind: "chat-changed" }
  | { kind: "story-updated" }
  | { kind: "mutation"; id: number | null }
  | { kind: "generation-stopped"; lastId: number | null }
  | { kind: "tick"; now: number };

export const candidateKey = (row: PolishRow, chatId: string, id: number, hash: (row: PolishRow) => string): CandidateKey => ({
  chatId, id, sendDate: String(row.send_date ?? ""), swipeId: typeof row.swipe_id === "number" ? row.swipe_id : 0, startHash: hash(row),
});

const slot = (chatId: string, id: number) => `${chatId}:${id}`;

const hit = (event: LedgerEvent, candidate: PolishCandidate): AbandonReason | null => {
  switch (event.kind) {
    case "generation-started": return event.dryRun || event.chatId !== candidate.chatId ? null : "generation-started";
    case "player-sent": return "player-sent";
    case "chat-changed": return "chat-changed";
    case "story-updated": return "story-updated";
    case "mutation": return event.id === null || event.id <= candidate.id ? "row-mutated" : null;
    case "generation-stopped": return event.lastId === null || event.lastId === candidate.id ? "generation-stopped" : null;
    case "tick": return event.now >= candidate.deadlineAt ? "deadline" : null;
  }
};

export class ConsumptionLedger {
  private readonly open = new Map<string, PolishCandidate>();

  start(key: CandidateKey, findings: number, now: number, holdMs: number): PolishCandidate {
    const existing = this.open.get(slot(key.chatId, key.id));
    if (existing && existing.sendDate === key.sendDate && existing.swipeId === key.swipeId && existing.startHash === key.startHash) return existing;
    const candidate: PolishCandidate = { ...key, findings, startedAt: now, deadlineAt: now + holdMs, abandoned: null };
    this.open.set(slot(key.chatId, key.id), candidate);
    return candidate;
  }

  find(chatId: string, id: number): PolishCandidate | null {
    return this.open.get(slot(chatId, id)) ?? null;
  }

  observe(event: LedgerEvent): PolishCandidate[] {
    const abandoned: PolishCandidate[] = [];
    for (const candidate of this.open.values()) {
      if (candidate.abandoned) continue;
      const reason = hit(event, candidate);
      if (!reason) continue;
      candidate.abandoned = reason;
      abandoned.push(candidate);
    }
    return abandoned;
  }

  close(candidate: PolishCandidate): void {
    if (this.open.get(slot(candidate.chatId, candidate.id)) === candidate) this.open.delete(slot(candidate.chatId, candidate.id));
  }

  size(): number {
    return this.open.size;
  }
}

export interface WriteTarget {
  row: PolishRow | null | undefined;
  sameObject: boolean;
  chatId: string;
}

export const writeMismatch = (candidate: PolishCandidate, target: WriteTarget, hash: (row: PolishRow) => string, now: number): AbandonReason | null => {
  if (candidate.abandoned) return candidate.abandoned;
  if (now >= candidate.deadlineAt) return "deadline";
  const row = target.row;
  if (!row || !target.sameObject || target.chatId !== candidate.chatId) return "write-mismatch";
  const swipe = typeof row.swipe_id === "number" ? row.swipe_id : 0;
  if (swipe !== candidate.swipeId || String(row.send_date ?? "") !== candidate.sendDate || hash(row) !== candidate.startHash) return "write-mismatch";
  return null;
};
