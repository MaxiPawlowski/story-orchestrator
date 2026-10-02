import type { BoundaryLogEntry } from "@engine/index";
import type { SharedReadAudit } from "@extraction/index";
import { buildSessionJournal, JOURNAL_LIMIT, PAYLOAD_CAPTURE_LIMIT, sanitizeJournalRecords, SessionJournal, type JournalRecord } from "./journal";
import type { PayloadCapture, TalkDecisionAudit } from "./types";

const at = (seconds: number) => new Date(Date.parse("2026-08-11T10:00:00.000Z") + seconds * 1000).toISOString();

const boundaryEntry = (overrides: Partial<BoundaryLogEntry> = {}) => ({
  at: Date.parse(at(2)),
  boundary: 1,
  before: { activeCheckpointId: "cp1" } as BoundaryLogEntry["before"],
  after: { activeCheckpointId: "cp2" } as BoundaryLogEntry["after"],
  fired: { from: "cp1", to: "cp2", gate: "mission_accepted == true", declarationIndex: 0 } as unknown as BoundaryLogEntry["fired"],
  source: "gate",
  context: { lastMessageId: 8, chatLength: 9 },
  queue: { applied: [{ source: "extractor", blackboardVersionSum: 0, deltas: [{ q: "mission_accepted", v: true }], outcomes: [] }], discarded: [] },
  ...overrides,
}) as BoundaryLogEntry;

const audit = (overrides: Partial<SharedReadAudit> = {}): SharedReadAudit => ({
  id: "audit-1",
  createdAt: at(1),
  priority: 0,
  reason: "cadence",
  contractHash: "hash",
  scope: ["mission_accepted"],
  window: { from: 4, to: 8 },
  prompt: "",
  rawResponse: "",
  acceptedDeltas: [{ delta: { q: "mission_accepted", v: true }, evidence: "I take the notice." }],
  rejected: [{ line: "DELTA q=nope", reason: "unknown quality" }],
  ...overrides,
});

const capture: PayloadCapture = { at: at(3), boundary: 1, reason: "generation", blocks: [{ key: "story_orchestrator_memory_facts", depth: 2, role: 0, value: "..." }] };

const talkDecision: TalkDecisionAudit = { at: at(4), messageId: 9, checkpointId: "cp2", chosenRosterId: "arin", chosenName: "Arin", source: "director", latencyMs: 420 };

describe("buildSessionJournal", () => {
  const journal = buildSessionJournal({
    records: [{ at: at(0), boundary: 0, messageId: 7, kind: "status", summary: "Loaded Quest for the Sun Ruins" }, { at: at(5), boundary: 1, messageId: 9, kind: "flag", summary: "felt railroaded", note: "felt railroaded" }],
    boundaryLog: [boundaryEntry()],
    audits: [audit()],
    reconciliationEvents: [{ id: "1:x", boundary: 1, checkpointId: "cp2", targetedKeys: ["luke_decision"], scheduledAt: at(6), resolvedAt: at(7), evidence: ["Luke stays behind."] }],
    payloadCaptures: [capture],
    talkDecisions: [talkDecision],
  });

  it("orders every ring onto one ascending timeline", () => {
    expect(journal.map((event) => event.kind)).toEqual(["status", "extraction", "delta", "boundary", "transition", "payload", "talk", "flag", "reconciliation", "reconciliation"]);
  });

  it("keeps the four gate-critical kinds addressable", () => {
    const kinds = new Set(journal.map((event) => event.kind));
    for (const kind of ["extraction", "transition", "payload", "flag"]) expect(kinds.has(kind as never)).toBe(true);
  });

  it("summarizes a transition by checkpoint ids", () => {
    expect(journal.find((event) => event.kind === "transition")?.summary).toBe("cp1 → cp2");
  });

  it("summarizes an extraction read with accepted and rejected counts", () => {
    const event = journal.find((item) => item.kind === "extraction");
    expect(event?.summary).toBe("read cadence msgs 4-8 → 1 accepted, 1 rejected");
    expect(event?.detail?.scope).toEqual(["mission_accepted"]);
  });

  it("emits one delta event per accepted delta with its evidence", () => {
    const event = journal.find((item) => item.kind === "delta");
    expect(event?.summary).toBe("mission_accepted = true");
    expect(event?.detail?.evidence).toBe("I take the notice.");
  });

  it("emits scheduled and resolved reconciliation events", () => {
    const events = journal.filter((item) => item.kind === "reconciliation");
    expect(events[0].summary).toContain("queued for luke_decision");
    expect(events[1].summary).toContain("resolved");
  });

  it("derives judge events from the call ring, fallbacks included, without persisting them as records", () => {
    const events = buildSessionJournal({
      records: [],
      boundaryLog: [],
      audits: [],
      reconciliationEvents: [],
      payloadCaptures: [],
      talkDecisions: [],
      judgeCalls: [
        { at: at(1), boundary: 1, messageId: 9, use: "director", model: "jev-1.13.0", latencyMs: 255, stateChars: 900, questionCount: 6, p: { who: "Arin", whoConfidence: 0.9 } },
        { at: at(2), boundary: 2, messageId: 11, use: "director", model: null, latencyMs: 0, stateChars: 0, questionCount: 0, fallback: "no-roles" },
      ],
    });
    expect(events.map((event) => event.summary)).toEqual(["judge director in 255 ms", "judge director fell back (no-roles) in 0 ms"]);
    expect(events[0]).toMatchObject({ kind: "judge", messageId: 9, detail: { model: "jev-1.13.0", questions: 6, p: { who: "Arin", whoConfidence: 0.9 } } });
  });

  it("v2.5 plan 07 A5: a judge event names the route that answered, and none when no model did", () => {
    const events = buildSessionJournal({
      records: [], boundaryLog: [], audits: [], reconciliationEvents: [], payloadCaptures: [], talkDecisions: [],
      judgeCalls: [
        { at: at(1), boundary: 1, messageId: 9, use: "scene", model: "jev-1.13.0", latencyMs: 255, stateChars: 900, questionCount: 6 },
        { at: at(2), boundary: 2, messageId: 11, use: "scene", model: null, latencyMs: 0, stateChars: 0, questionCount: 0, fallback: "unavailable" },
      ],
    });
    expect(events.map((event) => event.detail?.route)).toEqual(["judge:typesafe:jev-1.13.0", null]);
  });

  it("carries the flag note", () => {
    expect(journal.find((event) => event.kind === "flag")?.detail?.note).toBe("felt railroaded");
  });

  it("journals a silent boundary rather than omitting it (plan 01 §A)", () => {
    const quiet = buildSessionJournal({
      records: [],
      boundaryLog: [boundaryEntry({ fired: null, queue: { applied: [], discarded: [] } })],
      audits: [],
      reconciliationEvents: [],
      payloadCaptures: [],
      talkDecisions: [],
    });
    expect(quiet.map((event) => [event.kind, event.summary])).toEqual([["boundary", "boundary 1: nothing applied (gate)"]]);
  });
});

describe("SessionJournal", () => {
  it("T4-4: a queued judge write keeps the time it was first seen, so a tail polling every second records it once (T4-4-1 journal.jsonl:446-521)", () => {
    jest.useFakeTimers().setSystemTime(new Date("2026-10-02T05:11:31.482Z"));
    try {
      const journal = new SessionJournal();
      const queued = { source: "extractor" as const, origin: "judge:typed@1", blackboardVersionSum: 0, turnRange: { from: 12, to: 14 }, deltas: [{ q: "party_name", v: "The Second Tries", source: "extractor" as const }] };
      const read = () => journal.build({ boundaryLog: [], audits: [], reconciliationEvents: [], talkDecisions: [], pending: [queued] }).filter((event) => event.kind === "delta");
      const first = read();
      jest.setSystemTime(new Date("2026-10-02T05:11:32.494Z"));
      const second = read();
      expect(first).toHaveLength(1);
      expect(second).toEqual(first);
      expect(first[0].at).toBe("2026-10-02T05:11:31.482Z");
    } finally {
      jest.useRealTimers();
    }
  });

  it("records only status changes", () => {
    const journal = new SessionJournal();
    expect(journal.observeStatus("Loaded", { boundary: 0, messageId: -1 })).toBe(true);
    expect(journal.observeStatus("Loaded", { boundary: 0, messageId: -1 })).toBe(false);
    expect(journal.observeStatus("Committed boundary 1", { boundary: 1, messageId: 4 })).toBe(true);
    expect(journal.getRecords()).toHaveLength(2);
  });

  it("ignores an empty status", () => {
    const journal = new SessionJournal();
    expect(journal.observeStatus("", { boundary: 0, messageId: -1 })).toBe(false);
  });

  it("flags a moment with and without a note", () => {
    const journal = new SessionJournal();
    expect(journal.flag("  ", { boundary: 2, messageId: 11 }).summary).toBe("flagged this moment");
    const noted = journal.flag(" spoiled the twist ", { boundary: 2, messageId: 11 });
    expect(noted.summary).toBe("spoiled the twist");
    expect(noted.note).toBe("spoiled the twist");
  });

  it("caps the persisted ring", () => {
    const journal = new SessionJournal();
    for (let index = 0; index < JOURNAL_LIMIT + 10; index += 1) journal.observeStatus(`status ${index}`, { boundary: index, messageId: index });
    expect(journal.getRecords()).toHaveLength(JOURNAL_LIMIT);
    expect(journal.getRecords()[0].summary).toBe("status 10");
  });

  it("dedupes identical payload captures and caps the ring", () => {
    const journal = new SessionJournal();
    expect(journal.capture(capture)).toBe(true);
    expect(journal.capture({ ...capture, at: at(9) })).toBe(false);
    for (let index = 0; index < PAYLOAD_CAPTURE_LIMIT + 3; index += 1) journal.capture({ ...capture, boundary: index + 2 });
    expect(journal.getCaptures()).toHaveLength(PAYLOAD_CAPTURE_LIMIT);
  });

  it("hydrates persisted records and drops the in-memory captures", () => {
    const journal = new SessionJournal();
    journal.capture(capture);
    journal.hydrate([{ at: at(0), boundary: 0, messageId: 1, kind: "flag", summary: "kept" }] satisfies JournalRecord[]);
    expect(journal.getRecords()).toHaveLength(1);
    expect(journal.getCaptures()).toEqual([]);
  });

  it("builds from its own records and captures", () => {
    const journal = new SessionJournal();
    journal.observeStatus("Loaded", { boundary: 0, messageId: -1 });
    journal.capture(capture);
    const events = journal.build({ boundaryLog: [], audits: [], reconciliationEvents: [], talkDecisions: [] });
    expect(events.map((event) => event.kind).sort()).toEqual(["payload", "status"]);
  });
});

describe("sanitizeJournalRecords", () => {
  it("drops non-array and malformed input", () => {
    expect(sanitizeJournalRecords(undefined)).toEqual([]);
    expect(sanitizeJournalRecords([null, { kind: "flag" }, { at: at(0), boundary: 0, messageId: 0, kind: "flag", summary: "ok" }])).toHaveLength(1);
  });

  it("truncates to the ring cap", () => {
    const records = Array.from({ length: JOURNAL_LIMIT + 5 }, (_, index) => ({ at: at(index), boundary: index, messageId: index, kind: "status" as const, summary: `s${index}` }));
    expect(sanitizeJournalRecords(records)).toHaveLength(JOURNAL_LIMIT);
  });
});
