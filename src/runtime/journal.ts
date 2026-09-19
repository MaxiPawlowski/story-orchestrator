import type { BoundaryLogEntry } from "@engine/index";
import type { ReconciliationEvent, SharedReadAudit } from "@extraction/index";
import type { JudgeCallRecord } from "@judge/index";
import type { PayloadCapture, TalkDecisionAudit } from "./types";

export const JOURNAL_LIMIT = 200;
export const PAYLOAD_CAPTURE_LIMIT = 5;

export type JournalEventKind = "status" | "flag" | "story" | "boundary" | "transition" | "extraction" | "delta" | "reconciliation" | "payload" | "talk" | "stagecraft" | "judge";

// The persisted half of the journal: things nothing else records. Additive kinds read back fine
// from older chats — `sanitizeJournalRecords` keeps any record that carries a kind and a summary.
export type JournalRecordKind = "status" | "flag" | "story" | "stagecraft";

export interface JournalRecord {
  at: string;
  boundary: number;
  messageId: number;
  kind: JournalRecordKind;
  summary: string;
  note?: string;
}

export interface JournalEvent {
  at: string;
  boundary: number;
  messageId: number;
  kind: JournalEventKind;
  summary: string;
  detail?: Record<string, unknown>;
}

export interface JournalContext {
  boundary: number;
  messageId: number;
}

export interface JournalSources {
  records: JournalRecord[];
  boundaryLog: BoundaryLogEntry[];
  audits: SharedReadAudit[];
  reconciliationEvents: ReconciliationEvent[];
  payloadCaptures: PayloadCapture[];
  talkDecisions: TalkDecisionAudit[];
  judgeCalls?: JudgeCallRecord[];
}

const KIND_ORDER: JournalEventKind[] = ["flag", "story", "boundary", "transition", "extraction", "delta", "reconciliation", "talk", "judge", "stagecraft", "payload", "status"];

const rank = (kind: JournalEventKind) => KIND_ORDER.indexOf(kind);

const timeOf = (at: string) => {
  const parsed = Date.parse(at);
  return Number.isFinite(parsed) ? parsed : 0;
};

export const sanitizeJournalRecords = (value: unknown): JournalRecord[] => {
  if (!Array.isArray(value)) return [];
  return value
    .filter((entry): entry is JournalRecord => Boolean(entry) && typeof entry === "object" && (entry as JournalRecord).kind !== undefined && typeof (entry as JournalRecord).summary === "string")
    .slice(-JOURNAL_LIMIT);
};

const boundaryEvents = (log: BoundaryLogEntry[]): JournalEvent[] => log.flatMap((entry) => {
  const at = new Date(entry.at).toISOString();
  const base = { at, boundary: entry.boundary, messageId: entry.context.lastMessageId };
  const events: JournalEvent[] = [];
  const applied = entry.queue.applied.flatMap((item) => item.deltas.map((delta) => `${delta.q}=${String(delta.v)}`));
  if (applied.length || entry.source === "manual") {
    events.push({ ...base, kind: "boundary", summary: applied.length ? `applied ${applied.join(", ")}` : `boundary ${entry.boundary} (${entry.source})`, detail: { source: entry.source, applied, discarded: entry.queue.discarded.length } });
  }
  if (entry.fired) {
    events.push({ ...base, kind: "transition", summary: `${entry.before.activeCheckpointId} → ${entry.after.activeCheckpointId}`, detail: { gate: entry.fired.gate, source: entry.source } });
  }
  return events;
});

const extractionEvents = (audits: SharedReadAudit[]): JournalEvent[] => audits.flatMap((audit) => {
  const base = { at: audit.createdAt, boundary: -1, messageId: audit.window.to };
  const accepted = audit.acceptedDeltas.map((entry) => `${entry.delta.q}=${String(entry.delta.v)}`);
  return [
    {
      ...base,
      kind: "extraction",
      summary: `read ${audit.reason} msgs ${audit.window.from}-${audit.window.to} → ${accepted.length} accepted, ${audit.rejected.length} rejected`,
      detail: { scope: audit.scope, accepted, rejected: audit.rejected.map((item) => item.reason), sceneBreak: audit.sceneBreak?.reason ?? null },
    },
    ...audit.acceptedDeltas.map((entry) => ({
      ...base,
      kind: "delta" as const,
      summary: `${entry.delta.q} = ${String(entry.delta.v)}`,
      detail: { evidence: entry.evidence, reason: audit.reason },
    })),
  ];
});

const reconciliationEvents = (events: ReconciliationEvent[]): JournalEvent[] => events.flatMap((event) => {
  const rows: JournalEvent[] = [{
    at: event.scheduledAt,
    boundary: event.boundary,
    messageId: -1,
    kind: "reconciliation",
    summary: `stall re-check queued for ${event.targetedKeys.join(", ") || "recent scenes"}`,
    detail: { checkpointId: event.checkpointId, targetedKeys: event.targetedKeys },
  }];
  if (event.resolvedAt) {
    rows.push({ at: event.resolvedAt, boundary: event.boundary, messageId: -1, kind: "reconciliation", summary: `stall re-check resolved (${event.evidence.length} evidence)`, detail: { evidence: event.evidence } });
  }
  return rows;
});

export function buildSessionJournal(sources: JournalSources): JournalEvent[] {
  const events: JournalEvent[] = [
    ...sources.records.map((record) => ({ at: record.at, boundary: record.boundary, messageId: record.messageId, kind: record.kind, summary: record.summary, ...(record.note ? { detail: { note: record.note } } : {}) })),
    ...boundaryEvents(sources.boundaryLog),
    ...extractionEvents(sources.audits),
    ...reconciliationEvents(sources.reconciliationEvents),
    ...sources.payloadCaptures.map((capture) => ({
      at: capture.at,
      boundary: capture.boundary,
      messageId: -1,
      kind: "payload" as const,
      summary: `${capture.blocks.length} story blocks injected (${capture.reason})`,
      detail: { keys: capture.blocks.map((block) => `${block.key}@${block.depth}`) },
    })),
    ...sources.talkDecisions.map((decision) => ({
      at: decision.at,
      boundary: -1,
      messageId: decision.messageId,
      kind: "talk" as const,
      summary: `${decision.chosenName ?? "silence"} speaks (${decision.source})`,
      detail: { checkpointId: decision.checkpointId, latencyMs: decision.latencyMs },
    })),
    ...(sources.judgeCalls ?? []).map((call) => ({
      at: call.at,
      boundary: call.boundary,
      messageId: call.messageId,
      kind: "judge" as const,
      summary: `judge ${call.use}${call.fallback ? ` fell back (${call.fallback})` : ""} in ${call.latencyMs} ms`,
      detail: { model: call.model, questions: call.questionCount, stateChars: call.stateChars, ...(call.p ? { p: call.p } : {}) },
    })),
  ];
  return events.sort((left, right) => timeOf(left.at) - timeOf(right.at) || rank(left.kind) - rank(right.kind));
}

export class SessionJournal {
  private records: JournalRecord[] = [];
  private captures: PayloadCapture[] = [];
  private lastStatus: string | null = null;

  hydrate(records: unknown) {
    this.records = sanitizeJournalRecords(records);
    this.lastStatus = null;
    this.captures = [];
  }

  getRecords(): JournalRecord[] {
    return this.records;
  }

  getCaptures(): PayloadCapture[] {
    return this.captures;
  }

  observeStatus(status: string, context: JournalContext): boolean {
    if (!status || status === this.lastStatus) return false;
    this.lastStatus = status;
    this.push({ at: new Date().toISOString(), boundary: context.boundary, messageId: context.messageId, kind: "status", summary: status });
    return true;
  }

  record(kind: JournalRecordKind, summary: string, context: JournalContext, note?: string): JournalRecord {
    const record: JournalRecord = { at: new Date().toISOString(), boundary: context.boundary, messageId: context.messageId, kind, summary, ...(note ? { note } : {}) };
    this.push(record);
    return record;
  }

  flag(note: string, context: JournalContext): JournalRecord {
    const record: JournalRecord = { at: new Date().toISOString(), boundary: context.boundary, messageId: context.messageId, kind: "flag", summary: note.trim() || "flagged this moment", ...(note.trim() ? { note: note.trim() } : {}) };
    this.push(record);
    return record;
  }

  capture(capture: PayloadCapture): boolean {
    const latest = this.captures[0];
    if (latest && latest.boundary === capture.boundary && latest.reason === capture.reason && JSON.stringify(latest.blocks) === JSON.stringify(capture.blocks)) return false;
    this.captures = [capture, ...this.captures].slice(0, PAYLOAD_CAPTURE_LIMIT);
    return true;
  }

  build(sources: Omit<JournalSources, "records" | "payloadCaptures">): JournalEvent[] {
    return buildSessionJournal({ ...sources, records: this.records, payloadCaptures: this.captures });
  }

  private push(record: JournalRecord) {
    this.records = [...this.records, record].slice(-JOURNAL_LIMIT);
  }
}
