import type { BoundaryLogEntry, EngineHistory, EngineState, NormalizedStoryV2, NormalizedTransition, PrimitiveValue, QualityReadAs } from "@engine/index";
import { fnv1a, stableStringify } from "@runtime/hash";
import { windowOf } from "./chatRows";
import { renderSharedReadPrompt } from "./contract";
import { parseSharedReadResponse } from "./parse";
import { deriveScope } from "./scope";
import { readContract, refusal, screenDeltas } from "./sharedRead";
import type { ExtraGateSource, ParsedFact, ScopedQuality, SharedReadWindow } from "./types";

export const J6D_MIN_KEYS = 20;
export const J6D_RUNS = 2;
export const J6D_SHADOW_THRESHOLD = 0.1;
export const J6D_ARBITRATION_SAMPLE = 20;
export const J6D_CONFIDENCE_BANDS = [0.8, 0.9, 0.95] as const;

export interface ArchivedAudit {
  at: string;
  detail: {
    reason: string;
    priority: 0 | 1;
    window: { from: number; to: number };
    scope: string[];
    accepted: Array<{ q: string; v: PrimitiveValue; evidence?: string }>;
    judged: { keys: string[]; model: string | null; confidences: Record<string, number>; fallback?: string; error?: string } | null;
    prompt: string;
    rawResponse?: string;
    trimmedFrom?: number;
    truncated?: number[];
  };
}

export interface ArchivedBoundary {
  at: string;
  boundary: number;
}

export interface TranscriptSource {
  label: string;
  at: string | null;
  rows: unknown[];
}

export interface ReadContextSource {
  memoryFacts?: ParsedFact[];
  openArcs?: string[];
  entities?: string[];
  epistemicLedgerCapable?: boolean;
  extraGateSources?: ExtraGateSource[];
}

export interface ReplayArchive {
  story: NormalizedStoryV2;
  history: EngineHistory;
  transcripts: TranscriptSource[];
  boundaries: ArchivedBoundary[];
  context?: ReadContextSource;
}

export interface SessionFiles {
  journal: string;
  transcripts?: string;
  runtime: unknown;
  chatFull?: unknown;
}

export interface SessionArchive {
  storyId: string;
  storyRaw: Record<string, unknown>;
  history: EngineHistory;
  transcripts: TranscriptSource[];
  boundaries: ArchivedBoundary[];
  audits: ArchivedAudit[];
}

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);

const hostRow = (message: unknown): Record<string, unknown> => {
  const row = isObject(message) ? message : {};
  return { name: row.name, is_user: row.isUser === true, is_system: row.isSystem === true, mes: typeof row.text === "string" ? row.text : "", ...(isObject(row.extra) ? { extra: row.extra } : {}) };
};

const jsonLines = (text: string | undefined): unknown[] => (text ?? "").split(/\r?\n/).filter((line) => line.trim()).map((line) => JSON.parse(line) as unknown);

export function readSessionArchive(files: SessionFiles): SessionArchive {
  const blob = isObject(files.runtime) ? files.runtime : {};
  const stories = isObject(blob.stories) ? blob.stories : {};
  const storyId = typeof blob.selectedStoryId === "string" ? blob.selectedStoryId : Object.keys(stories)[0];
  const record = storyId ? stories[storyId] : undefined;
  if (!storyId || !isObject(record) || !isObject(record.pinnedStory) || !isObject(record.engineHistory)) throw new Error("the runtime blob holds no pinned story with an engine history");
  const rows = jsonLines(files.journal).filter(isObject);
  const audits = rows.filter((row) => row.kind === "audit" && isObject(row.detail) && typeof row.at === "string") as unknown as ArchivedAudit[];
  const boundaries = rows.filter((row) => row.kind === "boundary" && typeof row.boundary === "number" && row.boundary >= 0 && typeof row.at === "string")
    .map((row) => ({ at: row.at as string, boundary: row.boundary as number }));
  const revisions = jsonLines(files.transcripts).filter(isObject).filter((row) => Array.isArray(row.messages))
    .map((row, index) => ({ label: `transcripts:${index + 1}`, at: typeof row.at === "string" ? row.at : null, rows: (row.messages as unknown[]).map(hostRow) }));
  const full = Array.isArray(files.chatFull) ? [{ label: "chat-full", at: null, rows: files.chatFull.map(hostRow) }] : [];
  return { storyId, storyRaw: record.pinnedStory, history: record.engineHistory as unknown as EngineHistory, transcripts: [...revisions, ...full], boundaries, audits };
}

export interface AnsweredKey {
  key: string;
  readAs: QualityReadAs | null;
  confidence: number | null;
  before: PrimitiveValue | null;
  judge: { moved: boolean; value: PrimitiveValue | null };
}

export interface ReplayCase {
  id: string;
  at: string;
  reason: string;
  stateBoundary: number;
  transcript: string;
  window: SharedReadWindow;
  values: Record<string, PrimitiveValue>;
  residual: string[];
  fullScope: ScopedQuality[];
  fullPrompt: string;
  answered: AnsweredKey[];
}

export type RefusalCode =
  | "truncated-message" | "window-not-covered" | "missing-snapshot" | "scope-not-rebuilt" | "prompt-mismatch";

export interface ReplayRefusal {
  id: string;
  at: string;
  code: RefusalCode;
  reason: string;
}

export type SkipReason = "not-judged" | "judge-failed";

export type RebuildResult = { ok: true; case: ReplayCase } | { ok: false; refusal: ReplayRefusal } | { ok: "skip"; why: SkipReason };

const PROMPT_SECTIONS = ["Story:", "Canon-lite:", "Quality questions:", "Transcript:", "Output:"];

export const firstDifference = (archived: string, rebuilt: string): string => {
  const left = archived.split("\n");
  const right = rebuilt.split("\n");
  const line = left.findIndex((text, index) => text !== right[index]);
  const at = line < 0 ? Math.min(left.length, right.length) : line;
  const section = [...left.slice(0, at + 1)].reverse().find((text) => PROMPT_SECTIONS.some((header) => text.startsWith(header))) ?? "header";
  return `line ${at + 1} of ${left.length} (section ${section.replace(/:.*$/, ":")}), ${archived.length} vs ${rebuilt.length} chars`;
};

const caseId = (audit: ArchivedAudit) => fnv1a(stableStringify({ at: audit.at, window: audit.detail.window, prompt: audit.detail.prompt }));

const refuse = (audit: ArchivedAudit, code: RefusalCode, reason: string): RebuildResult => ({ ok: false, refusal: { id: caseId(audit), at: audit.at, code, reason } });

const sourcesFor = (audit: ArchivedAudit, transcripts: readonly TranscriptSource[]): TranscriptSource[] => {
  const covering = transcripts.filter((source) => source.rows.length > audit.detail.window.to);
  const dated = covering.filter((source) => source.at !== null && source.at >= audit.at).sort((left, right) => String(left.at).localeCompare(String(right.at)));
  return [...dated, ...covering.filter((source) => source.at === null)];
};

const statesFor = (audit: ArchivedAudit, history: EngineHistory, boundaries: readonly ArchivedBoundary[]): EngineState[] => {
  const all = [history.base, ...history.log.map((entry) => entry.after)].filter((state) => state.lastMessageId >= audit.detail.window.to);
  const committed = boundaries.filter((row) => row.at <= audit.at).map((row) => row.boundary);
  if (!committed.length) return [...all].sort((left, right) => left.boundary - right.boundary);
  const latest = Math.max(...committed);
  return all.filter((state) => state.boundary <= latest).sort((left, right) => right.boundary - left.boundary);
};

const firedUpTo = (log: readonly BoundaryLogEntry[], boundary: number): NormalizedTransition[] =>
  log.filter((entry) => entry.boundary <= boundary).map((entry) => entry.fired).filter((transition): transition is NormalizedTransition => Boolean(transition));

const factCandidates = (context: ReadContextSource | undefined, state: EngineState): ParsedFact[][] => {
  const known = (context?.memoryFacts ?? []).filter((fact) => fact.boundary === undefined || fact.boundary <= state.boundary);
  return known.length ? [known, []] : [[]];
};

const judgeSide = (audit: ArchivedAudit, key: string, before: PrimitiveValue | null): AnsweredKey["judge"] => {
  const delta = audit.detail.accepted.find((entry) => entry.q === key);
  return delta ? { moved: delta.v !== before, value: delta.v } : { moved: false, value: before };
};

export function rebuildCase(audit: ArchivedAudit, archive: ReplayArchive): RebuildResult {
  const judged = audit.detail.judged;
  if (judged?.fallback === "error") return { ok: "skip", why: "judge-failed" };
  if (!judged?.keys.length) return { ok: "skip", why: "not-judged" };
  if (audit.detail.truncated?.length) return refuse(audit, "truncated-message", "a message was cut to the read budget; the cut needs the read's tokenizer");
  const sources = sourcesFor(audit, archive.transcripts);
  if (!sources.length) return refuse(audit, "window-not-covered", `no archived transcript reaches message ${audit.detail.window.to}`);
  const states = statesFor(audit, archive.history, archive.boundaries);
  if (!states.length) return refuse(audit, "missing-snapshot", `no boundary snapshot at or after message ${audit.detail.window.to}`);
  const { story } = archive;
  const context = archive.context ?? {};
  let mismatch = "";
  let scopeGap = "";
  for (const state of states) {
    const derived = deriveScope(story, state.activeCheckpointId, state.blackboard, context.extraGateSources ?? []);
    const byKey = new Map(derived.map((entry) => [entry.key, entry]));
    const missing = [...audit.detail.scope, ...judged.keys].filter((key) => !byKey.has(key));
    if (missing.length) {
      scopeGap ||= `${missing.length} key(s) not in the rebuilt scope at boundary ${state.boundary}`;
      continue;
    }
    const residual = audit.detail.scope.map((key) => byKey.get(key) as ScopedQuality);
    const asked = new Set([...audit.detail.scope, ...judged.keys]);
    const fullScope = derived.filter((entry) => asked.has(entry.key));
    for (const source of sources) {
      const window = windowOf(source.rows, audit.detail.window.from, audit.detail.window.to);
      for (const facts of factCandidates(context, state)) {
        const options = {
          story, state, facts, firedTransitions: firedUpTo(archive.history.log, state.boundary),
          openArcs: context.openArcs ?? [], entities: context.entities ?? [], epistemicLedgerCapable: context.epistemicLedgerCapable ?? false,
        };
        const contract = readContract(options, window, residual);
        const prompt = renderSharedReadPrompt(contract);
        if (prompt !== audit.detail.prompt) {
          mismatch ||= firstDifference(audit.detail.prompt, prompt);
          continue;
        }
        const values = { ...state.blackboard.values };
        return {
          ok: true,
          case: {
            id: caseId(audit),
            at: audit.at,
            reason: audit.detail.reason,
            stateBoundary: state.boundary,
            transcript: source.label,
            window,
            values,
            residual: audit.detail.scope,
            fullScope,
            fullPrompt: renderSharedReadPrompt({ ...contract, qualities: fullScope }),
            answered: judged.keys.map((key) => {
              const before = values[key] ?? null;
              return { key, readAs: story.qualityByKey[key]?.read_as ?? null, confidence: judged.confidences[key] ?? null, before, judge: judgeSide(audit, key, before) };
            }),
          },
        };
      }
    }
  }
  if (mismatch) return refuse(audit, "prompt-mismatch", `the residual prompt does not re-render byte for byte: ${mismatch}`);
  return refuse(audit, "scope-not-rebuilt", scopeGap || "the residual scope could not be rebuilt");
}

export function rebuildSession(session: SessionArchive, story: NormalizedStoryV2, context?: ReadContextSource) {
  const archive: ReplayArchive = { story, history: session.history, transcripts: session.transcripts, boundaries: session.boundaries, ...(context ? { context } : {}) };
  const cases: ReplayCase[] = [];
  const refusals: ReplayRefusal[] = [];
  const skipped: Record<SkipReason, number> = { "not-judged": 0, "judge-failed": 0 };
  for (const audit of session.audits) {
    const result = rebuildCase(audit, archive);
    if (result.ok === "skip") skipped[result.why] += 1;
    else if (result.ok) cases.push(result.case);
    else refusals.push(result.refusal);
  }
  return { cases, refusals, skipped, rebuiltKeys: cases.reduce((sum, entry) => sum + entry.answered.length, 0) };
}

export interface ExtractorReply {
  text: string;
  finish?: "stop" | "length" | "unknown";
}

export type ExtractorSide = { refused: string } | { values: Record<string, { moved: boolean; value: PrimitiveValue | null; playerOnly: boolean }> };

export function extractorSide(replayCase: ReplayCase, story: NormalizedStoryV2, reply: ExtractorReply): ExtractorSide {
  const parsed = parseSharedReadResponse(reply.text, story, replayCase.values);
  const refused = refusal({ text: reply.text, finish: reply.finish ?? "stop" }, parsed);
  if (refused) return { refused };
  const screened = screenDeltas(parsed, replayCase.fullScope, new Set(), replayCase.window);
  const values: Record<string, { moved: boolean; value: PrimitiveValue | null; playerOnly: boolean }> = {};
  for (const answered of replayCase.answered) {
    const delta = screened.accepted.find((entry) => entry.delta.q === answered.key);
    const playerOnly = screened.playerOnly.some((entry) => entry.key === answered.key);
    values[answered.key] = delta ? { moved: delta.delta.v !== answered.before, value: delta.delta.v, playerOnly } : { moved: false, value: answered.before, playerOnly };
  }
  return { values };
}

export type KeyClass = "agree" | "disagree" | "judge-moved" | "extractor-moved";

export const classifyKey = (judge: { moved: boolean; value: PrimitiveValue | null }, extractor: { moved: boolean; value: PrimitiveValue | null }): KeyClass => {
  if (!judge.moved && !extractor.moved) return "agree";
  if (judge.moved && extractor.moved) return judge.value === extractor.value ? "agree" : "disagree";
  return judge.moved ? "judge-moved" : "extractor-moved";
};

export interface KeyRow {
  caseId: string;
  run: number;
  key: string;
  readAs: QualityReadAs | null;
  confidence: number | null;
  judge: PrimitiveValue | null;
  extractor: PrimitiveValue | null;
  playerOnly: boolean;
  class: KeyClass;
}

export interface CompareInput {
  cases: ReplayCase[];
  story: NormalizedStoryV2;
  replies: Record<string, ExtractorReply[]>;
}

export interface CompareResult {
  rows: KeyRow[];
  refusedReplies: Array<{ caseId: string; run: number; reason: string }>;
  unasked: string[];
}

export function compareCases({ cases, story, replies }: CompareInput): CompareResult {
  const rows: KeyRow[] = [];
  const refusedReplies: CompareResult["refusedReplies"] = [];
  const unasked: string[] = [];
  for (const replayCase of cases) {
    const runs = replies[replayCase.id] ?? [];
    if (!runs.length) unasked.push(replayCase.id);
    runs.forEach((reply, run) => {
      const side = extractorSide(replayCase, story, reply);
      if ("refused" in side) {
        refusedReplies.push({ caseId: replayCase.id, run, reason: side.refused });
        return;
      }
      for (const answered of replayCase.answered) {
        const extractor = side.values[answered.key];
        rows.push({
          caseId: replayCase.id, run, key: answered.key, readAs: answered.readAs, confidence: answered.confidence,
          judge: answered.judge.value, extractor: extractor.value, playerOnly: extractor.playerOnly, class: classifyKey(answered.judge, extractor),
        });
      }
    });
  }
  return { rows, refusedReplies, unasked };
}

export const confidenceBand = (confidence: number | null): string => {
  if (confidence === null) return "unknown";
  const [low, mid, high] = J6D_CONFIDENCE_BANDS;
  if (confidence < low) return `<${low}`;
  if (confidence < mid) return `${low}-${mid}`;
  if (confidence < high) return `${mid}-${high}`;
  return `>=${high}`;
};

const tally = (rows: readonly KeyRow[]) => {
  const classes: Record<KeyClass, number> = { "agree": 0, "disagree": 0, "judge-moved": 0, "extractor-moved": 0 };
  for (const row of rows) classes[row.class] += 1;
  const keys = rows.length;
  const differ = keys - classes.agree;
  return { keys, classes, disagreementRate: keys ? differ / keys : null, strictDisagreementRate: keys ? classes.disagree / keys : null };
};

const grouped = (rows: readonly KeyRow[], by: (row: KeyRow) => string) => {
  const groups: Record<string, ReturnType<typeof tally>> = {};
  for (const name of [...new Set(rows.map(by))].sort()) groups[name] = tally(rows.filter((row) => by(row) === name));
  return groups;
};

export type ReplayVerdict = "rate" | "insufficient" | "deferred";

export function summarizeReplay(result: CompareResult, refusals: readonly ReplayRefusal[], rebuilt: number) {
  const runs = [...new Set(result.rows.map((row) => row.run))].sort();
  const perRun = runs.map((run) => {
    const rows = result.rows.filter((row) => row.run === run);
    const counted = tally(rows);
    return { run, ...counted, verdict: (counted.keys < J6D_MIN_KEYS ? "insufficient" : "rate") as ReplayVerdict };
  });
  const pooled = tally(result.rows);
  const verdict: ReplayVerdict = !result.rows.length ? "deferred"
    : perRun.length < J6D_RUNS || perRun.some((row) => row.verdict === "insufficient") ? "insufficient" : "rate";
  const refusedBy: Partial<Record<RefusalCode, number>> = {};
  for (const refusalRow of refusals) refusedBy[refusalRow.code] = (refusedBy[refusalRow.code] ?? 0) + 1;
  return {
    verdict,
    rebuiltCases: rebuilt,
    refusedCases: refusals.length,
    refusedBy,
    unaskedCases: result.unasked.length,
    refusedReplies: result.refusedReplies.length,
    perRun,
    pooled: { ...pooled, disagreementRate: verdict === "rate" ? pooled.disagreementRate : null, strictDisagreementRate: verdict === "rate" ? pooled.strictDisagreementRate : null },
    byReadAs: grouped(result.rows, (row) => row.readAs ?? "unknown"),
    byConfidence: grouped(result.rows, (row) => confidenceBand(row.confidence)),
    buildLiveShadow: verdict === "rate" && (pooled.disagreementRate ?? 0) >= J6D_SHADOW_THRESHOLD,
  };
}

export const arbitrationSample = (rows: readonly KeyRow[], size = J6D_ARBITRATION_SAMPLE): KeyRow[] =>
  rows.filter((row) => row.class !== "agree")
    .map((row) => ({ row, rank: fnv1a(`${row.caseId}:${row.key}:${row.run}`) }))
    .sort((left, right) => left.rank.localeCompare(right.rank))
    .slice(0, size)
    .map((entry) => entry.row);
