// v2.4 plan 07 (X12, X23): the judge harness the control column and plan 09's cost report need.
//
// - The cost report reads the METER (monotonic, exempt from rollback). The ring rolls back with the
//   chat, so a total read from it undercounts spend; the difference is printed, never hidden.
// - The judge-on journey mode writes install-wide settings, so it captures them first and the
//   cleanup restores them, the same shape as the extraction settings (S11).
// - The arm diff compares a judge-on record with a judge-off control record of the same journey.

import { evaluateInST } from './evaluate.mts';
import { saveSettingsNow } from './settingsSave.mts';

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
}

/** The settings a mode writes. An unknown use is refused: a typo would otherwise run the "on" arm with nothing on. */
export function judgeModeSettings(before: JudgeConfigCapture, mode: JudgeMode): JudgeConfigCapture {
  const known = Object.keys(before.judge.uses);
  const unknown = mode.uses.filter((use) => use !== 'warden' && !known.includes(use));
  if (unknown.length) throw new Error(`unknown judge use(s) ${unknown.join(', ')}; this build declares ${known.join(', ')} (and warden)`);
  const warden = mode.uses.includes('warden');
  return {
    judge: { ...before.judge, enabled: mode.uses.length > 0, uses: Object.fromEntries(known.map((use) => [use, mode.uses.includes(use)])) },
    warden: { wardenEnabled: warden, wardenAcceptMode: warden ? mode.wardenMode ?? before.warden.wardenAcceptMode : before.warden.wardenAcceptMode },
  };
}

export async function readJudgeConfig(page): Promise<JudgeConfigCapture | null> {
  return evaluateInST(page, () => {
    const settings = globalThis.storyOrchestratorRuntime?.getGlobalSettings?.();
    if (!settings?.judge || !settings?.stagecraft) return null;
    return {
      judge: JSON.parse(JSON.stringify(settings.judge)),
      warden: { wardenEnabled: settings.stagecraft.wardenEnabled === true, wardenAcceptMode: settings.stagecraft.wardenAcceptMode },
    };
  });
}

export async function writeJudgeConfig(page, config: JudgeConfigCapture) {
  await evaluateInST(page, (next) => {
    const root = SillyTavern.getContext().extensionSettings['story-orchestrator'];
    if (!root?.settings) throw new Error('the extension settings root is missing');
    root.settings.judge = next.judge;
    globalThis.storyOrchestratorJudge?.invalidateStatus?.();
    globalThis.storyOrchestratorRuntime?.setStagecraftSettings?.(next.warden);
    return true;
  }, config);
  const saved = await saveSettingsNow(page).catch((error) => ({ error: error.message }));
  const verified = await readJudgeConfig(page);
  const matches = verified !== null
    && JSON.stringify(verified.judge.uses) === JSON.stringify(config.judge.uses)
    && verified.judge.enabled === config.judge.enabled
    && JSON.stringify(verified.warden) === JSON.stringify(config.warden);
  return { saved, verified, ok: matches && !('error' in saved) };
}

export async function applyJudgeMode(page, mode: JudgeMode) {
  const before = await readJudgeConfig(page);
  if (!before) throw new Error('the judge settings could not be read, so a judge-on run could not be restored; refusing to write them');
  const next = judgeModeSettings(before, mode);
  const written = await writeJudgeConfig(page, next);
  if (!written.ok) throw new Error(`the judge mode did not read back as written: ${JSON.stringify(written.verified)}`);
  return { mode, before, applied: next };
}

export async function restoreJudgeConfig(page, before: JudgeConfigCapture | null) {
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

export interface ArmSummary {
  label: string;
  file?: string;
  journey: string | null;
  mode: JudgeMode | null;
  meter: JudgeMeter | null;
  ring: ReturnType<typeof ringTotals>;
  warden: WardenTally | null;
  replies: number;
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
  };
}

export interface RescoreRate {
  arm: string;
  asked: number;
  answered: number;
  flagged: number;
  defectRate: number | null;
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
