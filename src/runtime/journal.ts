import type { ApplyQueueEntry, BoundaryLogEntry } from "@engine/index";
import type { ReconciliationEvent, SharedReadAudit } from "@extraction/index";
import type { JudgeCallRecord } from "@judge/index";
import type { PayloadCapture, TalkDecisionAudit } from "./types";
import { judgeRoute } from "./modelCalls";
import type { ModelCallRecord } from "./modelCallLog";

export const JOURNAL_LIMIT = 200;
export const PAYLOAD_CAPTURE_LIMIT = 5;

export type JournalEventKind = "status" | "flag" | "story" | "boundary" | "transition" | "extraction" | "delta" | "reconciliation" | "payload" | "talk" | "stagecraft"
  | "judge" | "lore" | "chapter" | "model-call" | "author";

// The persisted half of the journal: things nothing else records. Additive kinds read back fine
// from older chats — `sanitizeJournalRecords` keeps any record that carries a kind and a summary.
export type JournalRecordKind = "status" | "flag" | "story" | "stagecraft" | "lore" | "chapter" | "author";

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
  inheritedFrom?: string;
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
  modelCalls?: ModelCallRecord[];
  pending?: ApplyQueueEntry[];
  pendingSeenAt?: (key: string) => string;
  branchedFrom?: { chatId: string; at: string };
}

const KIND_ORDER: JournalEventKind[] = [
  "flag", "author", "story", "boundary", "transition", "extraction", "delta", "reconciliation", "talk", "judge", "model-call", "stagecraft", "lore", "chapter", "payload", "status",
];

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

export const DISCARD_REASON = "superseded: a newer read covered the same turns";

const writeText = (entry: ApplyQueueEntry) => entry.deltas.map((delta) => `${delta.q}=${String(delta.v)}`);
const queueRow = (entry: ApplyQueueEntry) => ({ origin: entry.origin ?? entry.source, deltas: writeText(entry) });

// Every boundary is journaled, including one that applied nothing, and each write says
// which read produced it (`origin` = the audit id) so read -> applied/discarded links by identity.
const boundaryEvents = (log: BoundaryLogEntry[]): JournalEvent[] => log.flatMap((entry) => {
  const at = new Date(entry.at).toISOString();
  const base = { at, boundary: entry.boundary, messageId: entry.context.lastMessageId };
  const events: JournalEvent[] = [];
  const applied = entry.queue.applied.map(queueRow).filter((row) => row.deltas.length);
  const discarded = entry.queue.discarded.map((item) => ({ ...queueRow(item), reason: DISCARD_REASON }));
  const appliedText = applied.flatMap((row) => row.deltas);
  const discardedText = discarded.flatMap((row) => row.deltas);
  const summary = [
    appliedText.length ? `applied ${appliedText.join(", ")}` : `boundary ${entry.boundary}: nothing applied (${entry.source})`,
    ...(discardedText.length ? [`discarded ${discardedText.join(", ")} (superseded)`] : []),
  ].join("; ");
  events.push({ ...base, kind: "boundary", summary, detail: { source: entry.source, applied, discarded } });
  if (entry.fired) {
    events.push({ ...base, kind: "transition", summary: `${entry.before.activeCheckpointId} → ${entry.after.activeCheckpointId}`, detail: { gate: entry.fired.gate, source: entry.source } });
  }
  return events;
});

const extractionEvents = (audits: SharedReadAudit[]): JournalEvent[] => audits.flatMap((audit) => {
  const base = { at: audit.createdAt, boundary: -1, messageId: audit.window.to };
  const accepted = audit.acceptedDeltas.map((entry) => `${entry.delta.q}=${String(entry.delta.v)}`);
  const ooc = audit.outOfCharacter ?? [];
  const leftOut = ooc.length ? `, ${ooc.length} out-of-character line${ooc.length === 1 ? "" : "s"} not read` : "";
  return [
    {
      ...base,
      kind: "extraction",
      summary: `read ${audit.reason} msgs ${audit.window.from}-${audit.window.to} → ${accepted.length} accepted, ${audit.rejected.length} rejected${leftOut}`,
      detail: { auditId: audit.id, scope: audit.scope, accepted, rejected: audit.rejected.map((item) => item.reason), sceneBreak: audit.sceneBreak?.reason ?? null,
        ...(ooc.length ? { outOfCharacter: ooc } : {}) },
    },
    ...audit.acceptedDeltas.map((entry) => ({
      ...base,
      kind: "delta" as const,
      summary: `${entry.delta.q} = ${String(entry.delta.v)}`,
      detail: { auditId: audit.id, evidence: entry.evidence, reason: audit.reason },
    })),
  ];
});

// Writes waiting for the next boundary. They carry no timestamp of their own, so each is placed at
// the read that produced it, or at build time when that read is no longer in the ring.
const pendingEvents = (pending: ApplyQueueEntry[], audits: SharedReadAudit[], seenAt: (key: string) => string): JournalEvent[] => pending.map((entry) => {
  const read = audits.find((audit) => audit.id === entry.origin);
  const summary = `queued ${writeText(entry).join(", ")} for the next boundary`;
  const origin = entry.origin ?? entry.source;
  return {
    at: read?.createdAt ?? seenAt(`${origin}|${entry.turnRange?.to ?? -1}|${summary}`),
    boundary: -1,
    messageId: entry.turnRange?.to ?? -1,
    kind: "delta" as const,
    summary,
    detail: { state: "queued", origin },
  };
});

const reconciliationEvents = (events: ReconciliationEvent[]): JournalEvent[] => events.flatMap((event) => {
  const rows: JournalEvent[] = [{
    at: event.scheduledAt,
    boundary: event.boundary,
    messageId: event.messageId ?? -1,
    kind: "reconciliation",
    summary: `stall re-check queued for ${event.targetedKeys.join(", ") || "recent scenes"}`,
    detail: { checkpointId: event.checkpointId, targetedKeys: event.targetedKeys },
  }];
  if (event.resolvedAt) {
    rows.push({
      at: event.resolvedAt,
      boundary: event.boundary,
      messageId: event.messageId ?? -1,
      kind: "reconciliation",
      summary: `stall re-check resolved (${event.evidence.length} evidence)`,
      detail: { evidence: event.evidence },
    });
  }
  return rows;
});

export function buildSessionJournal(sources: JournalSources): JournalEvent[] {
  const events: JournalEvent[] = [
    ...sources.records.map((record) => ({
      at: record.at,
      boundary: record.boundary,
      messageId: record.messageId,
      kind: record.kind,
      summary: record.summary,
      ...(record.note ? { detail: { note: record.note } } : {})
    })),
    ...boundaryEvents(sources.boundaryLog),
    ...extractionEvents(sources.audits),
    ...pendingEvents(sources.pending ?? [], sources.audits, sources.pendingSeenAt ?? (() => new Date().toISOString())),
    ...reconciliationEvents(sources.reconciliationEvents),
    ...sources.payloadCaptures.map((capture) => ({
      at: capture.at,
      boundary: capture.boundary,
      messageId: capture.messageId ?? -1,
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
      detail: {
        use: call.use, model: call.model, route: judgeRoute(call.model), questions: call.questionCount, stateChars: call.stateChars, latencyMs: call.latencyMs,
        ...(call.fallback ? { fallback: call.fallback } : {}), ...(call.cached ? { cached: true } : {}),
        ...(call.inputTokens !== undefined ? { inputTokens: call.inputTokens } : {}), ...(call.outputTokens !== undefined ? { outputTokens: call.outputTokens } : {}),
        ...(call.cost !== undefined ? { cost: call.cost } : {}), ...(call.p ? { p: call.p } : {}),
      },
    })),
    ...(sources.modelCalls ?? []).map((call) => ({
      at: call.at,
      boundary: -1,
      messageId: -1,
      kind: "model-call" as const,
      summary: `${call.pass} via ${call.route}: ${call.result}`,
      detail: { ...call },
    })),
  ];
  const branched = sources.branchedFrom;
  const attributed = branched ? events.map((event) => (timeOf(event.at) < timeOf(branched.at) ? { ...event, inheritedFrom: branched.chatId } : event)) : events;
  return attributed.sort((left, right) => timeOf(left.at) - timeOf(right.at) || rank(left.kind) - rank(right.kind));
}

export class SessionJournal {
  private records: JournalRecord[] = [];
  private captures: PayloadCapture[] = [];
  private lastStatus: string | null = null;
  private pendingSeen = new Map<string, string>();

  hydrate(records: unknown, status: string | null = null) {
    this.records = sanitizeJournalRecords(records);
    this.lastStatus = status;
    this.captures = [];
    this.pendingSeen = new Map();
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
    const record: JournalRecord = {
      at: new Date().toISOString(),
      boundary: context.boundary,
      messageId: context.messageId,
      kind: "flag",
      summary: note.trim() || "flagged this moment",
      ...(note.trim() ? { note: note.trim() } : {})
    };
    this.push(record);
    return record;
  }

  capture(capture: PayloadCapture): boolean {
    const latest = this.captures[0];
    if (latest && latest.boundary === capture.boundary && latest.reason === capture.reason && JSON.stringify(latest.blocks) === JSON.stringify(capture.blocks)) return false;
    this.captures = [capture, ...this.captures].slice(0, PAYLOAD_CAPTURE_LIMIT);
    return true;
  }

  noteFolded(folded: number): boolean {
    const [latest, ...rest] = this.captures;
    if (!latest || latest.folded === folded) return false;
    this.captures = [{ ...latest, folded }, ...rest];
    return true;
  }

  build(sources: Omit<JournalSources, "records" | "payloadCaptures" | "pendingSeenAt">): JournalEvent[] {
    const seen = new Map<string, string>();
    const pendingSeenAt = (key: string) => {
      const at = this.pendingSeen.get(key) ?? seen.get(key) ?? new Date().toISOString();
      seen.set(key, at);
      return at;
    };
    const events = buildSessionJournal({ ...sources, records: this.records, payloadCaptures: this.captures, pendingSeenAt });
    this.pendingSeen = seen;
    return events;
  }

  private push(record: JournalRecord) {
    this.records = [...this.records, record].slice(-JOURNAL_LIMIT);
  }
}
