import { classOf, noModelRunnable } from './modelClass.mts';

export const NOMODEL_LANES = [30, 31];

export interface ScenarioRow {
  path: string;
  shape?: { needsLlm?: boolean } | null;
  requires?: { lane?: string; prior?: string; plugins?: string[] } | null;
  decision?: string;
  reason?: string;
}

export interface SuiteList {
  scenarios: string[];
  journeys: Array<{ id: string; checks: string[] }>;
  left: string[];
  problems: string[];
}

export function noModelScenarios(rows: ScenarioRow[], modelOf: (path: string) => unknown, noModelOf: (rows: ScenarioRow[]) => ScenarioRow[]): { scenarios: string[]; left: string[]; problems: string[] } {
  const listed = noModelOf(rows.filter((row) => row.shape && !row.shape.needsLlm && row.decision === 'keep' && !row.requires?.plugins?.length));
  const problems = listed.filter((row) => modelOf(row.path) !== 'none').map((row) => `${row.path}: on the no-LLM no-model list but declares model ${String(modelOf(row.path))}`);
  const scenarios = listed.filter((row) => modelOf(row.path) === 'none').map((row) => row.path).sort();
  const left = rows
    .filter((row) => row.requires?.lane === 'no-model' && !scenarios.includes(row.path))
    .map((row) => `${row.path}: ${row.requires?.plugins?.length ? `needs server plugins, which the suite's offline lanes run without (${row.requires.plugins.join(', ')})` : row.requires?.prior ? `needs a prior step (${row.requires.prior})` : `decision ${row.decision ?? 'none'}${row.reason ? ` (${row.reason})` : ''}`}`)
    .sort();
  return { scenarios, left, problems };
}

export function noModelJourneys(journeys: Array<{ id: string; status?: string; checks?: Array<{ id: string; model?: unknown; mode?: string; dependsOn?: unknown }> }>): Array<{ id: string; checks: string[] }> {
  return journeys
    .filter((journey) => (journey.status ?? 'active') !== 'reserved' && /^(J|GS)\d+$/i.test(journey.id))
    .map((journey) => ({ id: journey.id, checks: noModelRunnable(journey.checks ?? []) }))
    .filter((journey) => journey.checks.length > 0)
    .sort((a, b) => a.id.localeCompare(b.id, 'en', { numeric: true }));
}

export const noneChecks = (checks: Array<{ model?: unknown; mode?: string }>) => checks.filter((check) => check.mode !== 'human' && classOf(check) === 'none').length;

export interface LaneStatus { lane: number; seeded?: boolean; serverUp?: boolean; noModel?: boolean; refused?: string; browser?: boolean }

export function laneProblems(status: LaneStatus[], lanes: number[]): string[] {
  const problems: string[] = [];
  for (const n of lanes) {
    const row = status.find((entry) => entry.lane === n);
    if (!row) { problems.push(`lane ${n}: not listed by st-lanes status`); continue; }
    if (row.refused) problems.push(`lane ${n}: refused (${row.refused})`);
    if (!row.seeded) problems.push(`lane ${n}: not seeded (st-lanes.mts seed ${n})`);
    if (!row.noModel) problems.push(`lane ${n}: has a model; make it a no-model lane first (st-lanes.mts stop ${n}; st-lanes.mts no-model ${n}; st-lanes.mts start ${n})`);
    if (!row.serverUp) problems.push(`lane ${n}: server not up (st-lanes.mts start ${n})`);
  }
  return problems;
}

export interface BatchRow { item: string; lane: number; run: number; status: string; notRunnable?: string | null; failures?: string[]; automated?: string | null; evidence?: { problems?: string[] } ; ms?: number }

export function summarizeBatch(results: BatchRow[]): { counts: Record<string, number>; lines: string[]; ok: boolean } {
  const counts: Record<string, number> = { GREEN: 0, RED: 0, INCOMPLETE: 0, 'NOT-RUNNABLE': 0 };
  const lines: string[] = [];
  for (const row of results) {
    counts[row.status] = (counts[row.status] ?? 0) + 1;
    if (row.status === 'GREEN') continue;
    const why = row.status === 'NOT-RUNNABLE' ? row.notRunnable : row.status === 'INCOMPLETE' ? (row.evidence?.problems ?? []).join('; ') : [row.automated, ...(row.failures ?? [])].filter(Boolean).join('; ');
    lines.push(`${row.status.padEnd(12)} ${row.item} (lane ${row.lane})${why ? `: ${why}` : ''}`);
  }
  return { counts, lines, ok: results.length > 0 && counts.GREEN === results.length };
}
export const STRETCH_GROUP = 'SO-Open-Stretch-Curve';
export const STRETCH_MEMBERS = ['Arin.png', 'DM Narrator.png'];
export const KEYLESS_CC_PROFILE = { id: 'so-nomodel-deepseek-keyless', mode: 'cc', exclude: [], api: 'deepseek', model: 'deepseek-chat', name: 'SO no-model DeepSeek (keyless)' };

const isObject = (value: unknown): value is Record<string, any> => Boolean(value) && typeof value === 'object' && !Array.isArray(value);

export function prepareLaneSettings(settings: unknown): { next: Record<string, any>; profileId: string | null; changes: string[] } {
  if (!isObject(settings) || !isObject(settings.extension_settings)) throw new Error('settings.json has no extension_settings');
  const next = structuredClone(settings) as Record<string, any>;
  const ext = next.extension_settings;
  const changes: string[] = [];
  ext.connectionManager = isObject(ext.connectionManager) ? ext.connectionManager : { profiles: [] };
  const profiles: Array<Record<string, any>> = Array.isArray(ext.connectionManager.profiles) ? ext.connectionManager.profiles : [];
  if (!profiles.some((profile) => profile.mode === 'cc' && profile.api === 'deepseek')) {
    profiles.push({ ...KEYLESS_CC_PROFILE });
    changes.push('added a keyless DeepSeek Chat Completion profile, unselected and on no role');
  }
  ext.connectionManager.profiles = profiles;
  const home = isObject(ext['story-orchestrator']) ? ext['story-orchestrator'] : {};
  const offered = profiles.filter((profile) => profile.mode !== 'cc');
  const previous = isObject(home.settings) && isObject(home.settings.extraction) ? home.settings.extraction.profileId : null;
  const profileId = offered.find((profile) => profile.id === previous)?.id ?? offered[0]?.id ?? null;
  if ('v2Stories' in home) { delete home.v2Stories; changes.push('dropped the unread v2Stories copy'); }
  home.settings = { judge: { enabled: false }, image: { enabled: false }, sprites: { enabled: false, explicit: true }, help: { onboardingSeen: true }, ...(profileId ? { extraction: { profileId } } : {}) };
  changes.push(`Story Orchestrator settings reset to defaults (judge, images, sprites off; memory model ${profileId ?? 'none'})`);
  ext['story-orchestrator'] = home;
  const disabled: unknown[] = Array.isArray(ext.disabledExtensions) ? ext.disabledExtensions : [];
  if (disabled.includes('memory')) changes.push('enabled SillyTavern Summarize (memory) with automatic summaries off');
  ext.disabledExtensions = disabled.filter((name) => name !== 'memory');
  ext.memory = { ...(isObject(ext.memory) ? ext.memory : {}), promptInterval: 0 };
  ext.vectors = { ...(isObject(ext.vectors) ? ext.vectors : {}), enabled_chats: false };
  if (isObject(next.accountStorage) && ['NavLockOn', 'NavOpened', 'WINavOpened'].some((key) => next.accountStorage[key] === 'true')) changes.push("ST's right and left panels unpinned and closed");
  next.accountStorage = { ...(isObject(next.accountStorage) ? next.accountStorage : {}), NavLockOn: 'false', NavOpened: 'false', WINavOpened: 'false' };
  return { next, profileId, changes };
}

export const LIBRARY_INDEX_FILE = ['user', 'files', 'so-library-index.json'];

export function stretchGroupFile(now: number, stamp: string) {
  return {
    id: String(now), name: STRETCH_GROUP, members: STRETCH_MEMBERS, avatar_url: 'img/ai4.png', allow_self_responses: false, activation_strategy: 2,
    generation_mode: 0, disabled_members: [], fav: false, chat_id: stamp, chats: [stamp], auto_mode_delay: 5, generation_mode_join_prefix: '', generation_mode_join_suffix: '',
  };
}

export const PREPARE_PROBE = "const s=rt.getGlobalSettings(); const groups=ctx.groups.map((g)=>g.name); const ext=ctx.extensionSettings; return { image:s.image.enabled, sprites:s.sprites.enabled, judge:s.judge.enabled, profileId:s.extraction.profileId ?? null, stretch:groups.includes('SO-Open-Stretch-Curve'), cast:groups.includes('SOIMG Test cast'), arin:groups.includes('Group: Arin, DM Narrator'), memory:!ext.disabledExtensions.includes('memory'), sd:ext.disabledExtensions.includes('stable-diffusion'), deepseek:ext.connectionManager.profiles.some((p)=>p.mode==='cc'&&p.api==='deepseek') };";

export function prepareProblems(probe: Record<string, unknown> | null): string[] {
  if (!probe) return ['the lane page could not be probed'];
  const want: Record<string, unknown> = { image: false, sprites: false, judge: false, stretch: true, cast: true, arin: true, memory: true, sd: true, deepseek: true };
  const problems = Object.entries(want).filter(([key, value]) => probe[key] !== value).map(([key, value]) => `${key} reads ${JSON.stringify(probe[key])}, wanted ${JSON.stringify(value)}`);
  if (!probe.profileId) problems.push('no memory model profile is selected');
  return problems;
}
export interface ServedBuild { commit: string | null; dirty: boolean | null; bundle: string | null; builtAt: string | null }

export function servedBuild(manifest: unknown): ServedBuild | null {
  if (!isObject(manifest)) return null;
  const revision = isObject(manifest.extension) && isObject(manifest.extension.revision) ? manifest.extension.revision : {};
  return {
    commit: typeof revision.commit === 'string' ? revision.commit : null,
    dirty: typeof revision.dirty === 'boolean' ? revision.dirty : null,
    bundle: isObject(manifest.bundle) && typeof manifest.bundle.sha256 === 'string' ? manifest.bundle.sha256 : null,
    builtAt: typeof manifest.builtAt === 'string' ? manifest.builtAt : null,
  };
}

export function servedBuildChange(before: ServedBuild | null, after: ServedBuild | null): string | null {
  if (!before || !after) return 'the staged build manifest could not be read before and after the batch';
  if (before.bundle === after.bundle && before.builtAt === after.builtAt) return null;
  return `the staged build changed during the batch (${before.commit?.slice(0, 8) ?? '?'} built ${before.builtAt ?? '?'} -> ${after.commit?.slice(0, 8) ?? '?'} built ${after.builtAt ?? '?'}): the lanes serve SillyTavern's staged copy, so rows before and after ran different code and the run proves nothing`;
}
