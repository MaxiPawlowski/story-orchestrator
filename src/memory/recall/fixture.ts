import type { SourceSpan } from "../audience";
import { heldSecrets, type HeldSecret } from "../heldSecrets";
import type { EpistemicEntry } from "../types";
import { revisionOf } from "../witness/contract";
import { replayWitnessReads, type RecordedWitnessRead, type WitnessRosterMember } from "../witness/replay";
import type { WitnessRecordState } from "../witness/types";
import type { RecallCandidate, RecallTelling } from "./eligibility";
import { findMessage, type RecallMessage } from "./live";

export const RECALL_FIXTURE_FORMAT = "so-recall-fixture/1";

export type RecallRole = "gold" | "nonce" | "secret" | "origin" | "telling" | "forbidden" | "bait" | "filler";
export type RecallCaseKind = "positive" | "exclusion" | "secret" | "told" | "vr2k" | "vr8" | "withheld";

export interface FixtureMessage extends RecallMessage {
  heard: string[];
  nonce?: string;
}

export interface FixturePoolEntry {
  messageId: number;
  quote: string;
  role?: RecallRole;
  indexed?: string;
  indexedMessage?: string;
  speaker?: string;
  trueSpeaker?: string | null;
}

export interface FixtureCase {
  id: string;
  kind: RecallCaseKind;
  member: string;
  query: string;
  generationType?: string;
  pool: FixturePoolEntry[];
}

export interface FixtureQuoteRef {
  messageId: number;
  quote: string;
}

export interface FixtureEpistemic {
  id: string;
  subject: string;
  tag: EpistemicEntry["tag"];
  content: string;
  hiddenFrom?: string;
  scene: string;
}

export interface FixtureSession {
  id: string;
  chatId: string;
  storyId: string;
  storyHash: string;
  player: string;
  roster: WitnessRosterMember[];
  messages: FixtureMessage[];
  reads: RecordedWitnessRead[];
  tellings: Array<{ receiver: string; telling: FixtureQuoteRef; origin: FixtureQuoteRef }>;
  epistemic: FixtureEpistemic[];
  cases: FixtureCase[];
}

export interface RecallFixture {
  format: typeof RECALL_FIXTURE_FORMAT;
  set: string;
  synthetic: boolean;
  pool: string;
  sessions: FixtureSession[];
}

export interface LoadedEntry {
  entry: FixturePoolEntry;
  candidate: RecallCandidate;
}

export interface LoadedSession {
  session: FixtureSession;
  chat: FixtureMessage[];
  witness: WitnessRecordState;
  rejectedWitnessLines: number;
  tellings: RecallTelling[];
  secrets: HeldSecret[];
  cases: Array<{ fixtureCase: FixtureCase; pool: LoadedEntry[] }>;
}

const spanOf = (session: FixtureSession, ref: FixtureQuoteRef & Pick<FixturePoolEntry, "indexedMessage" | "speaker">): SourceSpan => {
  const message = findMessage(session.messages, ref.messageId);
  const text = ref.indexedMessage ?? message?.text;
  if (text === undefined) throw new Error(`${session.id}: message ${ref.messageId} has no text (removed messages need indexedMessage)`);
  const at = text.indexOf(ref.quote);
  if (at < 0 || text.indexOf(ref.quote, at + 1) >= 0) throw new Error(`${session.id}: quote ${JSON.stringify(ref.quote)} is not exactly once in message ${ref.messageId}`);
  return {
    chatId: session.chatId, storyId: session.storyId, messageId: ref.messageId, revision: revisionOf({ messageId: ref.messageId, text, swipeId: message?.swipeId }),
    speaker: message?.speaker ?? ref.speaker ?? "", isUser: message?.isUser ?? false, span: [at, at + ref.quote.length],
  };
};

const epistemicEntry = (row: FixtureEpistemic): EpistemicEntry => ({
  id: row.id, subject: row.subject, tag: row.tag, content: row.content, hiddenFrom: row.hiddenFrom, createdAt: 0,
  provenance: { source: "extractor", messageId: 0, boundary: 0, pass: "fixture", validity: "live" },
});

export function loadRecallSession(session: FixtureSession): LoadedSession {
  const { state, rejected } = replayWitnessReads(session.reads, session.messages, session.roster);
  return {
    session,
    chat: session.messages,
    witness: state,
    rejectedWitnessLines: rejected.length,
    tellings: session.tellings.map((row) => ({ receiver: row.receiver, telling: spanOf(session, row.telling), origin: spanOf(session, row.origin) })),
    secrets: heldSecrets(session.epistemic.map(epistemicEntry), session.roster.map((member) => member.name)),
    cases: session.cases.map((fixtureCase) => ({
      fixtureCase,
      pool: fixtureCase.pool.map((entry) => ({ entry, candidate: { source: spanOf(session, entry), text: entry.indexed ?? entry.quote } })),
    })),
  };
}

export function checkRecallFixture(raw: unknown): RecallFixture {
  const fixture = raw as RecallFixture;
  if (!fixture || fixture.format !== RECALL_FIXTURE_FORMAT) throw new Error(`fixture is not ${RECALL_FIXTURE_FORMAT}`);
  if (typeof fixture.synthetic !== "boolean" || !Array.isArray(fixture.sessions)) throw new Error("fixture needs synthetic and sessions");
  return fixture;
}
