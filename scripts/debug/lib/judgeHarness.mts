// v2.4 plan 07 (X12, X23): the judge harness the control column and plan 09's cost report need.
//
// - The cost report reads the METER (monotonic, exempt from rollback). The ring rolls back with the
//   chat, so a total read from it undercounts spend; the difference is printed, never hidden.
// - The judge-on journey mode writes install-wide settings, so it captures them first and the
//   cleanup restores them, the same shape as the extraction settings (S11).
// - The arm diff compares a judge-on record with a judge-off control record of the same journey.

import { evaluateInST } from './evaluate.mts';
import { saveSettingsNow } from './settingsSave.mts';
import { restateCheck, swing, WARDEN_OVER_STEER_FAMILIES, type OverSteerFamily } from './overSteer.mts';

// docs.typesafe.ai/models, read 2026-09-24: jev-1.13.0 costs $0.042 per million INPUT tokens and
// output is free. An estimate from the meter, never a host-reported cost.
export const JEV_USD_PER_MTOK_INPUT = 0.042;

const NEVER_SENT = new Set(['unavailable', 'invalid', 'disabled', 'no-roles', 'no-seam']);

export interface JudgeCallEvent {
  at?: string;
  messageId?: number;
  kind?: string;
  summary?: string;
  detail?: { use?: string; model?: string | null; fallback?: string; cached?: boolean; inputTokens?: number; outputTokens?: number; cost?: number; latencyMs?: number };
}

export interface JudgeMeter {
  calls: number;
  cachedCalls: number;
  inputTokens: number;
  outputTokens: number;
  cost: number;
  lastAnsweredModel?: string | null;
}

const useOf = (event: JudgeCallEvent): string => event.detail?.use ?? /^judge (\S+)/.exec(event.summary ?? '')?.[1] ?? 'unknown';

export function filterJudgeCalls(events: JudgeCallEvent[], { use = null as string | null } = {}): JudgeCallEvent[] {
  return events.filter((event) => (event.kind ?? 'judge') === 'judge' && (!use || useOf(event) === use));
}

export interface UseTotals {
  calls: number;
  cachedCalls: number;
  inputTokens: number;
  outputTokens: number;
  cost: number;
  fallbacks: Record<string, number>;
}

const emptyTotals = (): UseTotals => ({ calls: 0, cachedCalls: 0, inputTokens: 0, outputTokens: 0, cost: 0, fallbacks: {} });

const addEvent = (totals: UseTotals, event: JudgeCallEvent): UseTotals => {
  const detail = event.detail ?? {};
  const fallbacks = detail.fallback ? { ...totals.fallbacks, [detail.fallback]: (totals.fallbacks[detail.fallback] ?? 0) + 1 } : totals.fallbacks;
  if (detail.cached) return { ...totals, cachedCalls: totals.cachedCalls + 1, fallbacks };
  if (detail.fallback && NEVER_SENT.has(detail.fallback)) return { ...totals, fallbacks };
  return {
    calls: totals.calls + 1,
    cachedCalls: totals.cachedCalls,
    inputTokens: totals.inputTokens + (detail.inputTokens ?? 0),
    outputTokens: totals.outputTokens + (detail.outputTokens ?? 0),
    cost: totals.cost + (detail.cost ?? 0),
    fallbacks,
  };
};

export function ringTotals(events: JudgeCallEvent[]): UseTotals & { byUse: Record<string, UseTotals> } {
  const judged = filterJudgeCalls(events);
  const byUse: Record<string, UseTotals> = {};
  for (const event of judged) byUse[useOf(event)] = addEvent(byUse[useOf(event)] ?? emptyTotals(), event);
  return { ...judged.reduce(addEvent, emptyTotals()), byUse };
}

export function costReport(meter: JudgeMeter | null, events: JudgeCallEvent[]) {
  const ring = ringTotals(events);
  return {
    meter,
    ring,
    // What the ring no longer shows: calls a rollback cut and calls that outlived their chat. Spent
    // all the same, which is why the meter is the one to report (X23).
    notInRing: meter ? { calls: meter.calls - ring.calls, inputTokens: meter.inputTokens - ring.inputTokens } : null,
    estimatedUsd: meter ? Number(((meter.inputTokens / 1_000_000) * JEV_USD_PER_MTOK_INPUT).toFixed(6)) : null,
    hostCost: meter && meter.cost > 0 ? meter.cost : null,
    priceSource: 'docs.typesafe.ai/models 2026-09-24: $0.042 per million input tokens, output free',
  };
}

// ---- judge-on journey mode ------------------------------------------------------------------

export interface JudgeMode {
  label: 'on' | 'off';
  uses: string[];
  wardenMode?: 'auto' | 'review';
}

/** `--judge-uses off` is the control arm; a list is the judge-on arm. `warden` is the stagecraft switch. */
export function parseJudgeMode(value: string | null | undefined, wardenMode?: string | null): JudgeMode | null {
  if (value === null || value === undefined) return null;
  const uses = value.split(',').map((use) => use.trim()).filter((use) => use && use !== 'off');
  if (wardenMode && !['auto', 'review'].includes(wardenMode)) throw new Error(`--warden-mode must be auto or review (got ${wardenMode})`);
  return { label: uses.length ? 'on' : 'off', uses, ...(wardenMode ? { wardenMode: wardenMode as 'auto' | 'review' } : {}) };
}

export const modeFromSetup = (setup: { judge?: { uses?: string[]; wardenMode?: 'auto' | 'review' } } | undefined): JudgeMode | null =>
  setup?.judge ? { label: setup.judge.uses?.length ? 'on' : 'off', uses: setup.judge.uses ?? [], ...(setup.judge.wardenMode ? { wardenMode: setup.judge.wardenMode } : {}) } : null;

export interface JudgeConfigCapture {
  judge: { enabled: boolean; uses: Record<string, boolean> } & Record<string, unknown>;
  warden: { wardenEnabled: boolean; wardenAcceptMode: string };
  curator: { curatorEnabled: boolean; acceptMode: string };
}

/** v2.4 plan 07 T22/T23: judge uses that ride the warden's note path and share its accept mode. */
export const WARDEN_JUDGE_USES = ['agencyCheck', 'houseRules'];

/** The settings a mode writes. An unknown use is refused: a typo would otherwise run the "on" arm with nothing on. */
export function judgeModeSettings(before: JudgeConfigCapture, mode: JudgeMode): JudgeConfigCapture {
  const known = Object.keys(before.judge.uses);
  const unknown = mode.uses.filter((use) => use !== 'warden' && !known.includes(use));
  if (unknown.length) throw new Error(`unknown judge use(s) ${unknown.join(', ')}; this build declares ${known.join(', ')} (and warden)`);
  const warden = mode.uses.includes('warden');
  const wardenFamily = warden || WARDEN_JUDGE_USES.some((use) => mode.uses.includes(use));
  return {
    judge: { ...before.judge, enabled: mode.uses.length > 0, uses: Object.fromEntries(known.map((use) => [use, mode.uses.includes(use)])) },
    warden: { wardenEnabled: warden, wardenAcceptMode: wardenFamily ? mode.wardenMode ?? before.warden.wardenAcceptMode : before.warden.wardenAcceptMode },
    curator: before.curator,
  };
}

export async function readJudgeConfig(page): Promise<JudgeConfigCapture | null> {
  return evaluateInST(page, () => {
    const settings = globalThis.storyOrchestratorRuntime?.getGlobalSettings?.();
    if (!settings?.judge || !settings?.stagecraft) return null;
    return {
      judge: JSON.parse(JSON.stringify(settings.judge)),
      warden: { wardenEnabled: settings.stagecraft.wardenEnabled === true, wardenAcceptMode: settings.stagecraft.wardenAcceptMode },
      curator: { curatorEnabled: settings.stagecraft.curatorEnabled === true, acceptMode: settings.stagecraft.acceptMode },
    };
  });
}

export async function writeJudgeConfig(page, config: JudgeConfigCapture) {
  await evaluateInST(page, (next) => {
    const root = SillyTavern.getContext().extensionSettings['story-orchestrator'];
    if (!root?.settings) throw new Error('the extension settings root is missing');
    root.settings.judge = next.judge;
    globalThis.storyOrchestratorJudge?.invalidateStatus?.();
    globalThis.storyOrchestratorRuntime?.setStagecraftSettings?.({ ...next.warden, ...next.curator });
    return true;
  }, config);
  const saved = await saveSettingsNow(page).catch((error) => ({ error: error.message }));
  const verified = await readJudgeConfig(page);
  const matches = verified !== null
    && JSON.stringify(verified.judge.uses) === JSON.stringify(config.judge.uses)
    && verified.judge.enabled === config.judge.enabled
    && JSON.stringify(verified.warden) === JSON.stringify(config.warden)
    && JSON.stringify(verified.curator) === JSON.stringify(config.curator);
  return { saved, verified, ok: matches && !('error' in saved) };
}

export async function applyJudgeMode(page, mode: JudgeMode) {
  const before = await readJudgeConfig(page);
  if (!before) throw new Error('the judge settings could not be read, so a judge-on run could not be restored; refusing to write them');
  const next = judgeModeSettings(before, mode);
  const written = await writeJudgeConfig(page, next);
  if (!written.ok) throw new Error(`the judge mode did not read back as written: ${JSON.stringify(written.verified)}`);
  await markJudgeMode(page, mode);
  return { mode, before, applied: next };
}

/** A check that writes the judge settings itself (J8.5) reads this, so a `--judge-uses off` arm stays off. */
export async function markJudgeMode(page, mode: JudgeMode | null) {
  return evaluateInST(page, (next) => {
    if (next) (globalThis as any).__soJudgeMode = next;
    else delete (globalThis as any).__soJudgeMode;
    return true;
  }, mode);
}

export async function restoreJudgeConfig(page, before: JudgeConfigCapture | null) {
  await markJudgeMode(page, null);
  if (!before) return { restored: false, reason: 'no pre-run capture' };
  const current = await readJudgeConfig(page);
  if (current && JSON.stringify(current) === JSON.stringify(before)) return { restored: false, unchanged: true };
  const written = await writeJudgeConfig(page, before);
  return { restored: true, ok: written.ok, ...(written.ok ? {} : { error: 'judge settings did not read back as restored' }) };
}

// ---- what a journey record keeps for the control column -------------------------------------

export interface WardenTally {
  flagged: number;
  applied: number;
  lapsed: number;
  rejected: number;
  pending: number;
}

export function wardenTally(proposals: Array<{ curator?: string; ops?: Array<{ status?: string; message?: string }> }> = []): WardenTally {
  const ops = proposals.filter((record) => record.curator === 'warden').flatMap((record) => record.ops ?? []);
  return {
    flagged: proposals.filter((record) => record.curator === 'warden').length,
    applied: ops.filter((op) => op.status === 'applied').length,
    lapsed: ops.filter((op) => op.status === 'rejected' && op.message === 'lapsed').length,
    rejected: ops.filter((op) => op.status === 'rejected' && op.message !== 'lapsed').length,
    pending: ops.filter((op) => op.status === 'pending' || op.status === 'accepted').length,
  };
}

export interface WardenNote {
  text: string;
  replyMessageId: number;
  family?: string;
}

type ProposalView = { curator?: string; messageId?: number; ops?: Array<{ status?: string; message?: string; op?: { text?: unknown; replyMessageId?: unknown; [key: string]: unknown } }> };

export function wardenNotes(proposals: ProposalView[] = []): WardenNote[] {
  return proposals
    .filter((record) => record.curator === 'warden')
    .flatMap((record) => (record.ops ?? [])
      .filter((op) => op.status === 'applied' && typeof op.op?.text === 'string')
      .map((op) => ({ text: op.op?.text as string, replyMessageId: Number.isInteger(op.op?.replyMessageId) ? op.op?.replyMessageId as number : record.messageId ?? -1, family: typeof op.op?.family === 'string' ? op.op.family as string : 'continuity' })));
}

export interface ReplyRow {
  id: string;
  reply?: { speaker?: string; text?: string };
  player?: string;
  playerMessage?: string;
  houseRules?: string[];
}

export interface ArmSummary {
  label: string;
  file?: string;
  journey: string | null;
  mode: JudgeMode | null;
  meter: JudgeMeter | null;
  ring: ReturnType<typeof ringTotals>;
  warden: WardenTally | null;
  replies: number;
  notes: WardenNote[];
  rows: ReplyRow[];
}

export function armSummary(record, file?: string): ArmSummary {
  const cleanup = record?.cleanup ?? {};
  const events: JudgeCallEvent[] = cleanup.judgeCalls?.events ?? [];
  return {
    label: cleanup.judgeMode?.mode?.label ?? cleanup.judgeMode?.label ?? 'unlabelled',
    ...(file ? { file } : {}),
    journey: record?.id ?? null,
    mode: cleanup.judgeMode?.mode ?? null,
    meter: cleanup.judgeMeter ?? null,
    ring: ringTotals(events),
    warden: cleanup.warden ?? null,
    replies: cleanup.rescore?.rows?.length ?? 0,
    notes: cleanup.wardenNotes ?? [],
    rows: cleanup.rescore?.rows ?? [],
  };
}

export interface RescoreRate {
  arm: string;
  asked: number;
  answered: number;
  flagged: number;
  defectRate: number | null;
}

/** One declared fact set for every arm: live facts differ per arm when extraction read the replies differently, and a contradictory set flags whichever side a reply takes. */
export function withEstablished<T extends { established?: string[] }>(rows: T[], facts: string[] | null): T[] {
  if (!facts) return rows;
  if (!facts.length) throw new Error('--facts names no fact');
  return rows.map((row) => ({ ...row, established: [...facts] }));
}

export function rescoreRates(results: Array<{ arm: string; flagged: boolean | null }>): RescoreRate[] {
  const arms = [...new Set(results.map((row) => row.arm))];
  return arms.map((arm) => {
    const own = results.filter((row) => row.arm === arm);
    const answered = own.filter((row) => row.flagged !== null);
    const flagged = answered.filter((row) => row.flagged === true).length;
    return { arm, asked: own.length, answered: answered.length, flagged, defectRate: answered.length ? Number((flagged / answered.length).toFixed(4)) : null };
  });
}

export function diffArms(off: ArmSummary, on: ArmSummary, rates: RescoreRate[] = []) {
  if (off.journey && on.journey && off.journey !== on.journey) throw new Error(`the arms ran different journeys (${off.journey} vs ${on.journey}); a control column compares the same scripted turns`);
  const rate = (label: string) => rates.find((row) => row.arm === label)?.defectRate ?? null;
  const row = (metric: string, a: number | null, b: number | null) => ({ metric, off: a, on: b, delta: a === null || b === null ? null : Number((b - a).toFixed(4)) });
  return [
    row('judge calls (meter)', off.meter?.calls ?? null, on.meter?.calls ?? null),
    row('cached calls (meter)', off.meter?.cachedCalls ?? null, on.meter?.cachedCalls ?? null),
    row('input tokens (meter)', off.meter?.inputTokens ?? null, on.meter?.inputTokens ?? null),
    row('output tokens (meter)', off.meter?.outputTokens ?? null, on.meter?.outputTokens ?? null),
    row('fallbacks (ring)', Object.values(off.ring.fallbacks).reduce((sum, count) => sum + count, 0), Object.values(on.ring.fallbacks).reduce((sum, count) => sum + count, 0)),
    row('flagged replies (warden)', off.warden?.flagged ?? null, on.warden?.flagged ?? null),
    row('notes applied (warden)', off.warden?.applied ?? null, on.warden?.applied ?? null),
    row('replies captured', off.replies, on.replies),
    row('next-reply defect rate (rescore)', rate(off.label), rate(on.label)),
  ];
}

const rowIndex = (row: ReplyRow) => Number(String(row.id).replace(/^m/, ''));

const replyAfter = (rows: ReplyRow[], messageId: number) => rows
  .filter((row) => Number.isInteger(rowIndex(row)) && rowIndex(row) > messageId && row.reply?.text?.trim())
  .sort((left, right) => rowIndex(left) - rowIndex(right))[0] ?? null;

/** Plan 01's over-steer probe over two archived arms: reply N+1 after each applied note, and the control arm's reply to the same turn. */
export function overSteerColumns(on: Pick<ArmSummary, 'notes' | 'rows'>, off: Pick<ArmSummary, 'rows'>, family: OverSteerFamily, scores: Record<string, number> = {}) {
  const notes = WARDEN_OVER_STEER_FAMILIES.includes(family.name) ? on.notes.filter((note) => (note.family ?? 'continuity') === family.name) : on.notes;
  return notes.map((note) => {
    const reply = replyAfter(on.rows, note.replyMessageId);
    const control = replyAfter(off.rows, note.replyMessageId);
    const view = (row: ReplyRow | null) => (row ? { id: row.id, speaker: row.reply?.speaker ?? '' } : null);
    const base = { family: family.name, note: note.text, replyMessageId: note.replyMessageId, control: view(control) };
    if (!reply) return { ...base, reply: null, restate: null, controlRestate: null, swing: null, missing: `no reply after message ${note.replyMessageId} in the on arm` };
    const text = reply.reply?.text ?? '';
    const controlText = control?.reply?.text ?? '';
    return {
      ...base,
      reply: view(reply),
      restate: restateCheck(note.text, text, family),
      controlRestate: control ? restateCheck(note.text, controlText, family) : null,
      swing: control ? swing(text, controlText) : null,
      ...(scores[reply.id] !== undefined ? { replyScore: scores[reply.id] } : {}),
      missing: null,
    };
  });
}

// ---- plan 09's cost report (CL): totals from the METER, per-call detail from the ring -----------

export interface CostRecordInput {
  file?: string;
  meter: JudgeMeter | null;
  events: JudgeCallEvent[];
  boundaries: number | null;
}

export const costInputOf = (record, file?: string): CostRecordInput => ({
  ...(file ? { file } : {}),
  meter: record?.cleanup?.judgeMeter ?? null,
  events: record?.cleanup?.judgeCalls?.events ?? [],
  boundaries: typeof record?.cleanup?.boundaries === 'number' ? record.cleanup.boundaries : null,
});

const percentile = (values: number[], share: number): number | null => {
  if (!values.length) return null;
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.min(sorted.length - 1, Math.ceil(share * sorted.length) - 1)];
};

export const ON_PATH_USES = ['director', 'lore'];
export const ON_PATH_BUDGET_MS = 1500;

/**
 * X23: the totals are the meters' (monotonic, never cut by a rollback), summed over the records. The ring
 * rows supply what the meter cannot: which use spent it, latency, fallbacks, and the answering model.
 * Per-use tokens are therefore a ring reading and are labelled as a floor; `notInRing` says by how much.
 */
export function costReportAcross(inputs: CostRecordInput[]) {
  const metered = inputs.filter((input) => input.meter);
  const meter = metered.reduce((sum, input) => ({
    calls: sum.calls + input.meter!.calls,
    cachedCalls: sum.cachedCalls + input.meter!.cachedCalls,
    inputTokens: sum.inputTokens + input.meter!.inputTokens,
    outputTokens: sum.outputTokens + input.meter!.outputTokens,
    cost: sum.cost + input.meter!.cost,
  }), { calls: 0, cachedCalls: 0, inputTokens: 0, outputTokens: 0, cost: 0 });
  const boundaries = inputs.every((input) => input.boundaries !== null) ? inputs.reduce((sum, input) => sum + (input.boundaries ?? 0), 0) : null;
  const events = inputs.flatMap((input) => filterJudgeCalls(input.events));
  const ring = ringTotals(events);
  const uses = [...new Set(events.map(useOf))].sort();
  const perUse = uses.map((use) => {
    const own = events.filter((event) => useOf(event) === use);
    const totals = ring.byUse[use];
    const latencies = own.filter((event) => !event.detail?.cached && typeof event.detail?.latencyMs === 'number' && !(event.detail?.fallback && NEVER_SENT.has(event.detail.fallback))).map((event) => event.detail!.latencyMs as number);
    const fallbackTotal = Object.values(totals.fallbacks).reduce((sum, count) => sum + count, 0);
    return {
      use,
      calls: totals.calls,
      cachedCalls: totals.cachedCalls,
      callsPerBoundary: boundaries ? Number((totals.calls / boundaries).toFixed(4)) : null,
      latencyMs: { p50: percentile(latencies, 0.5), p90: percentile(latencies, 0.9), max: latencies.length ? Math.max(...latencies) : null },
      ringTokens: { input: totals.inputTokens, output: totals.outputTokens },
      fallbackRate: own.length ? Object.fromEntries(Object.entries(totals.fallbacks).map(([reason, count]) => [reason, Number((count / own.length).toFixed(4))])) : {},
      fallbacks: fallbackTotal,
      models: [...new Set(own.map((event) => event.detail?.model).filter((model): model is string => typeof model === 'string' && model.length > 0))],
      ...(ON_PATH_USES.includes(use) ? { onPathBudgetMs: ON_PATH_BUDGET_MS, overBudget: latencies.filter((value) => value > ON_PATH_BUDGET_MS).length } : {}),
    };
  });
  const usd = (meter.inputTokens / 1_000_000) * JEV_USD_PER_MTOK_INPUT;
  return {
    records: inputs.length,
    metered: metered.length,
    unmetered: inputs.filter((input) => !input.meter).map((input) => input.file ?? '(record)'),
    boundaries,
    meter,
    estimatedUsd: Number(usd.toFixed(6)),
    usdPer1000Boundaries: boundaries ? Number(((usd / boundaries) * 1000).toFixed(6)) : null,
    hostCost: meter.cost > 0 ? meter.cost : null,
    notInRing: { calls: meter.calls - ring.calls, inputTokens: meter.inputTokens - ring.inputTokens },
    perUse,
    priceSource: 'docs.typesafe.ai/models 2026-09-24: $0.042 per million input tokens, output free',
    note: 'totals and $ from the meters (X23); per-use tokens are ring readings, a floor by notInRing',
  };
}
