import { recallCue } from "./cues";
import { loadRecallSession, type FixtureMessage, type LoadedEntry, type LoadedSession, type RecallFixture } from "./fixture";
import { findMessage } from "./live";
import { RECALL_TOKEN_CAP, RECALL_TOP_K, selectRecall, type RecallLine, type RecallRank, type RecallSelection } from "./select";

export const RECALL_MINIMUMS = { positives: 20, exclusions: 20, askers: 3, secretScenes: 2, sessions: 2 } as const;
export const RECALL_FLOORS = { vr1: 0.7, vr2: 0, vr2s: 0, vr2t: 0, vr2kEligible: RECALL_TOP_K, vr2kForbidden: 0, vr3Max: RECALL_TOKEN_CAP, vr8WrongSpeaker: 0, vr8ByteEqual: 1 } as const;

export interface RecallRatio {
  hits: number;
  of: number;
  rate: number | null;
}

const ratio = (hits: number, of: number): RecallRatio => ({ hits, of, rate: of ? hits / of : null });

export interface RecallCaseOutcome {
  session: string;
  id: string;
  kind: string;
  member: string;
  cue: string | null;
  considered: number;
  quotable: number;
  lines: Array<{ messageId: number; role: string; speaker: string }>;
  tokens: number;
  refused: Record<string, number>;
}

export interface RecallReport {
  counts: { sessions: number; cases: number; positives: number; exclusions: number; askers: number; secretScenes: number; rejectedWitnessLines: number };
  vr1: RecallRatio;
  vr2: { nonceLines: number; unwitnessedLines: number; exclusionCases: number };
  vr2s: { cases: number; secretCandidates: number; leaks: number; provenanceRefusals: number; keptFromOnlyRefusals: number; attributionRefusals: number };
  vr2t: { cases: number; originLines: number; tellingLines: number; originRefused: number };
  vr2k: { cases: number; forbiddenInPool: number; eligibleInPool: number; eligibleReturnedMin: number | null; forbiddenReturned: number };
  vr3: { maxTokens: number; cap: number; blocks: number };
  vr8: { lines: number; wrongSpeaker: number; byteEqual: RecallRatio; bait: number; baitRefused: number; baitReasons: Record<string, number> };
  withheld: { cases: number; fired: number };
  minimums: Record<keyof typeof RECALL_MINIMUMS, boolean>;
  floors: Record<"vr1" | "vr2" | "vr2s" | "vr2t" | "vr2k" | "vr3" | "vr8" | "withheld", boolean | null>;
  verdict: "pass" | "fail" | "insufficient";
  cases: RecallCaseOutcome[];
}

const bump = (counts: Record<string, number>, key: string) => {
  counts[key] = (counts[key] ?? 0) + 1;
};

const refusalKey = (refusal: RecallSelection["refused"][number]): string => (refusal.stage === "eligibility" ? `eligibility: ${refusal.verdict.reason}` : `attribution: ${refusal.reason}`);

interface Scored {
  loaded: LoadedSession;
  pool: LoadedEntry[];
  selection: RecallSelection;
  cue: string | null;
  kind: string;
  member: string;
  id: string;
}

const entryOf = (scored: Scored, line: RecallLine): LoadedEntry => scored.pool.find((entry) => entry.candidate === line.candidate) as LoadedEntry;

const truthSpeaker = (loaded: LoadedSession, entry: LoadedEntry, message: FixtureMessage | null): string | null =>
  (entry.entry.trueSpeaker !== undefined ? entry.entry.trueSpeaker : message?.isUser ? loaded.session.player : message?.speaker ?? null);

function runCases(fixture: RecallFixture, rank?: RecallRank): Scored[] {
  return fixture.sessions.map(loadRecallSession).flatMap((loaded) => loaded.cases.map(({ fixtureCase, pool }): Scored => {
    const { roster, player } = loaded.session;
    const member = roster.find((entry) => entry.id === fixtureCase.member);
    if (!member) throw new Error(`${loaded.session.id}/${fixtureCase.id}: member ${fixtureCase.member} not in the roster`);
    const cue = recallCue(fixtureCase.query, roster.map((entry) => entry.name), fixtureCase.generationType);
    const ctx = { member: { id: member.id, names: [member.name] }, chat: loaded.chat, witness: loaded.witness, tellings: loaded.tellings, secrets: loaded.secrets };
    const selection = cue
      ? selectRecall(pool.map((entry) => entry.candidate), ctx, { roster, playerName: player, rank })
      : { lines: [], block: "", tokens: 0, considered: 0, quotable: 0, refused: [] };
    return { loaded, pool, selection, cue: cue?.cue ?? null, kind: fixtureCase.kind, member: member.id, id: fixtureCase.id };
  }));
}

const roleOf = (scored: Scored, line: RecallLine) => entryOf(scored, line).entry.role ?? "filler";

export function scoreRecallFixture(fixture: RecallFixture, rank?: RecallRank): RecallReport {
  const scored = runCases(fixture, rank);
  const of = (kind: string) => scored.filter((entry) => entry.kind === kind);
  const lines = scored.flatMap((entry) => entry.selection.lines.map((line) => ({
    scored: entry, line, message: findMessage(entry.loaded.chat, line.candidate.source.messageId) as FixtureMessage | null,
  })));
  const positives = of("positive");
  const vr1 = ratio(positives.filter((entry) => entry.selection.lines.some((line) => roleOf(entry, line) === "gold")).length, positives.length);
  const unwitnessed = lines.filter(({ scored: entry, message }) => !message?.heard.includes(entry.member));
  const vr2 = { nonceLines: unwitnessed.filter(({ message }) => message?.nonce).length, unwitnessedLines: unwitnessed.length, exclusionCases: of("exclusion").length };
  const secretRows = scored.flatMap((entry) => entry.pool.filter((row) => row.entry.role === "secret").map((row) => ({ entry, row })));
  const refusalFor = (entry: Scored, row: LoadedEntry) => entry.selection.refused.find((refusal) => refusal.candidate === row.candidate);
  const secretRefusals = secretRows.map(({ entry, row }) => refusalFor(entry, row));
  const vr2s = {
    cases: of("secret").length,
    secretCandidates: secretRows.length,
    leaks: secretRows.filter(({ entry, row }) => entry.selection.lines.some((line) => line.candidate === row.candidate)).length,
    provenanceRefusals: secretRefusals.filter((refusal) => refusal?.stage === "eligibility" && refusal.verdict.reason !== "held secret").length,
    keptFromOnlyRefusals: secretRefusals.filter((refusal) => refusal?.stage === "eligibility" && refusal.verdict.reason === "held secret").length,
    attributionRefusals: secretRefusals.filter((refusal) => refusal?.stage === "attribution").length,
  };
  const told = of("told");
  const vr2t = {
    cases: told.length,
    originLines: told.reduce((sum, entry) => sum + entry.selection.lines.filter((line) => roleOf(entry, line) === "origin").length, 0),
    tellingLines: told.reduce((sum, entry) => sum + entry.selection.lines.filter((line) => roleOf(entry, line) === "telling").length, 0),
    originRefused: told.reduce((sum, entry) => sum + entry.selection.refused.filter((refusal) => refusal.stage === "eligibility" && refusal.verdict.reason === "origin of a telling").length, 0),
  };
  const topK = of("vr2k");
  const eligibleReturned = topK.map((entry) => entry.selection.lines.filter((line) => roleOf(entry, line) !== "forbidden").length);
  const vr2k = {
    cases: topK.length,
    forbiddenInPool: topK.reduce((sum, entry) => sum + entry.pool.filter((row) => row.entry.role === "forbidden").length, 0),
    eligibleInPool: topK.reduce((sum, entry) => sum + entry.pool.filter((row) => row.entry.role !== "forbidden").length, 0),
    eligibleReturnedMin: eligibleReturned.length ? Math.min(...eligibleReturned) : null,
    forbiddenReturned: topK.reduce((sum, entry) => sum + entry.selection.lines.filter((line) => roleOf(entry, line) === "forbidden").length, 0),
  };
  const blocks = scored.filter((entry) => entry.selection.lines.length);
  const vr3 = { maxTokens: Math.max(0, ...scored.map((entry) => entry.selection.tokens)), cap: RECALL_TOKEN_CAP, blocks: blocks.length };
  const bait = scored.flatMap((entry) => entry.pool.filter((row) => row.entry.role === "bait").map((row) => ({ entry, row })));
  const baitReasons: Record<string, number> = {};
  bait.forEach(({ entry, row }) => {
    const refusal = refusalFor(entry, row);
    if (refusal) bump(baitReasons, refusalKey(refusal));
  });
  const vr8 = {
    lines: lines.length,
    wrongSpeaker: lines.filter(({ scored: entry, line, message }) => truthSpeaker(entry.loaded, entryOf(entry, line), message) !== line.speaker).length,
    byteEqual: ratio(lines.filter(({ line, message }) => message !== null && message.text.slice(line.candidate.source.span[0], line.candidate.source.span[1]) === line.quote
      && line.line === `${line.speaker} said: "${line.quote}"`).length, lines.length),
    bait: bait.length,
    baitRefused: bait.filter(({ entry, row }) => refusalFor(entry, row)).length,
    baitReasons,
  };
  const withheldCases = of("withheld");
  const withheld = { cases: withheldCases.length, fired: withheldCases.filter((entry) => entry.cue !== null || entry.selection.lines.length).length };
  const askers = new Set(scored.map((entry) => entry.member)).size;
  const secretScenes = new Set(fixture.sessions.flatMap((session) => session.epistemic.filter((row) => row.tag === "hiding" || row.tag === "unaware").map((row) => `${session.id}:${row.scene}`))).size;
  const counts = {
    sessions: fixture.sessions.length, cases: scored.length, positives: positives.length, exclusions: vr2.exclusionCases, askers, secretScenes,
    rejectedWitnessLines: [...new Set(scored.map((entry) => entry.loaded))].reduce((sum, loaded) => sum + loaded.rejectedWitnessLines, 0),
  };
  const minimums = {
    positives: counts.positives >= RECALL_MINIMUMS.positives, exclusions: counts.exclusions >= RECALL_MINIMUMS.exclusions, askers: askers >= RECALL_MINIMUMS.askers,
    secretScenes: secretScenes >= RECALL_MINIMUMS.secretScenes, sessions: counts.sessions >= RECALL_MINIMUMS.sessions,
  };
  const floors = {
    vr1: vr1.rate === null ? null : vr1.rate >= RECALL_FLOORS.vr1 - 1e-9,
    vr2: vr2.nonceLines === RECALL_FLOORS.vr2 && vr2.unwitnessedLines === 0,
    vr2s: vr2s.cases ? vr2s.leaks === RECALL_FLOORS.vr2s && vr2s.keptFromOnlyRefusals === 0 : null,
    vr2t: vr2t.cases ? vr2t.originLines === RECALL_FLOORS.vr2t : null,
    vr2k: vr2k.cases ? (vr2k.eligibleReturnedMin ?? 0) >= RECALL_FLOORS.vr2kEligible && vr2k.forbiddenReturned === RECALL_FLOORS.vr2kForbidden : null,
    vr3: vr3.maxTokens <= RECALL_FLOORS.vr3Max,
    vr8: vr8.wrongSpeaker === RECALL_FLOORS.vr8WrongSpeaker && (vr8.byteEqual.rate ?? 1) >= RECALL_FLOORS.vr8ByteEqual,
    withheld: withheld.cases ? withheld.fired === 0 : null,
  };
  const verdict = !Object.values(minimums).every(Boolean) ? "insufficient" : Object.values(floors).every((value) => value !== false) ? "pass" : "fail";
  const cases = scored.map((entry): RecallCaseOutcome => {
    const refused: Record<string, number> = {};
    entry.selection.refused.forEach((refusal) => bump(refused, refusalKey(refusal)));
    return {
      session: entry.loaded.session.id, id: entry.id, kind: entry.kind, member: entry.member, cue: entry.cue, considered: entry.selection.considered, quotable: entry.selection.quotable,
      lines: entry.selection.lines.map((line) => ({ messageId: line.candidate.source.messageId, role: roleOf(entry, line), speaker: line.speaker })), tokens: entry.selection.tokens, refused,
    };
  });
  return { counts, vr1, vr2, vr2s, vr2t, vr2k, vr3, vr8, withheld, minimums, floors, verdict, cases };
}
