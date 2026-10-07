import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { DEBUG_DIR, PROJECT_ROOT } from './connection.mts';
import { evaluateInST } from './evaluate.mts';
import { readRequiresFacts } from './scenarioRequiresHost.mts';
import { notRunnableLine } from './scenarioRequires.mts';
import { pinRoleProfile, restoreRoleProfiles } from './roleEffort.mts';

export const B1_RECORD_ROOT = join(PROJECT_ROOT, 'test', 'phase-c', 'records');
export const B1_LAB_ENV = 'SO_ADOLION_LAB';
export const LABELLER_ROLE = 'synthesis';
export const LEAK_MIN_CHARS = 16;
export const NOT_RUNNABLE_EXIT = 2;

export type RunNumber = 1 | 2;

export const recordPath = (rowId: string, run: RunNumber, root: string = B1_RECORD_ROOT) => join(root, rowId, `run-${run}.json`);
export const rawPath = (rowId: string, run: RunNumber, debugDir: string = DEBUG_DIR) => join(debugDir, 'b1', rowId, `run-${run}.raw.json`);
export const recordRef = (rowId: string, run: RunNumber) => `test/phase-c/records/${rowId}/run-${run}.json`;

export function argValue(args: string[], name: string, fallback: string | null = null): string | null {
  const index = args.indexOf(name);
  return index >= 0 && args[index + 1] && !args[index + 1].startsWith('--') ? args[index + 1] : fallback;
}

export function runNumber(value: string | null | undefined): RunNumber {
  if (value === '1' || value === '2') return Number(value) as RunNumber;
  throw new Error(`--run takes 1 or 2 (rule 4: two consecutive runs on one lane), got ${JSON.stringify(value ?? null)}`);
}

export const insideRepo = (path: string, root: string = PROJECT_ROOT): boolean => {
  const rel = relative(resolve(root), resolve(path));
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel));
};

export function labProblems(dir: string | null, files: string[], { root = PROJECT_ROOT, exists = existsSync }: { root?: string; exists?: (path: string) => boolean } = {}): string[] {
  if (!dir) return [`needs the campaign lab directory (--lab <dir> or ${B1_LAB_ENV}): the lab data lives in the private campaign repo, never in this one`];
  if (insideRepo(dir, root)) return [`the lab directory ${dir} is inside this public repo: reference the campaign checkout by path, never copy campaign content here`];
  if (!exists(dir)) return [`the lab directory ${dir} does not exist`];
  return files.filter((file) => !exists(join(dir, file))).map((file) => `the lab directory has no ${file}`);
}

export const labDirOf = (args: string[], env: NodeJS.ProcessEnv = process.env): string | null => {
  const given = argValue(args, '--lab') ?? (String(env[B1_LAB_ENV] ?? '').trim() || null);
  return given ? resolve(given) : null;
};

export const readJsonFile = async (path: string) => JSON.parse(await readFile(path, 'utf-8'));

const collectStrings = (value: unknown, out: string[] = []): string[] => {
  if (typeof value === 'string') out.push(value);
  else if (Array.isArray(value)) value.forEach((entry) => collectStrings(entry, out));
  else if (value && typeof value === 'object') Object.values(value).forEach((entry) => collectStrings(entry, out));
  return out;
};

export function leakedText(summary: unknown, sources: unknown, min: number = LEAK_MIN_CHARS): string[] {
  const published = JSON.stringify(summary ?? null).toLowerCase();
  const texts = [...new Set(collectStrings(sources).map((text) => text.trim()).filter((text) => text.length >= min))];
  return texts.filter((text) => published.includes(JSON.stringify(text).slice(1, -1).toLowerCase()));
}

export interface B1Write {
  rowId: string;
  run: RunNumber;
  summary: Record<string, unknown>;
  raw: unknown;
  privateText: unknown;
  root?: string;
  debugDir?: string;
}

export async function writeB1Record({ rowId, run, summary, raw, privateText, root = B1_RECORD_ROOT, debugDir = DEBUG_DIR }: B1Write): Promise<{ record: string; raw: string }> {
  const leaks = leakedText(summary, privateText);
  if (leaks.length) throw new Error(`${rowId}: the public summary carries ${leaks.length} private text(s) (chat or campaign text belongs in the raw file only); nothing was written`);
  const record = recordPath(rowId, run, root);
  const rawFile = rawPath(rowId, run, debugDir);
  await mkdir(dirname(record), { recursive: true });
  await mkdir(dirname(rawFile), { recursive: true });
  await writeFile(record, `${JSON.stringify({ row: rowId, run, writtenAt: new Date().toISOString(), raw: 'private (SO_DEBUG_DIR/b1); archive with npm run sessions:archive', ...summary }, null, 2)}\n`, 'utf-8');
  await writeFile(rawFile, `${JSON.stringify(raw, null, 2)}\n`, 'utf-8');
  return { record, raw: rawFile };
}

export interface B1Needs {
  handles?: string[];
  model?: boolean;
  judge?: boolean;
  profiles?: string[];
}

export interface B1Facts {
  handles: Record<string, boolean>;
  judgeConfigured: boolean | null;
  judgeProbe: string | null;
  modelReachable: boolean | null;
  modelProbe: string | null;
  profileNames: string[];
  profileIds: string[];
}

export async function readB1Facts(page, needs: B1Needs): Promise<B1Facts> {
  const facts = needs.model ? await readRequiresFacts(page, { lane: 'model' }) : { modelReachable: null, modelProbe: null };
  const own = await evaluateInST(page, async ({ handles, judge }) => {
    const ctx = SillyTavern.getContext();
    const profiles = ctx.extensionSettings?.connectionManager?.profiles ?? [];
    let judgeConfigured = null;
    let judgeProbe = null;
    if (judge) {
      try {
        const response = await fetch('/api/plugins/story-orchestrator-judge/status', { headers: ctx.getRequestHeaders() });
        const body = response.ok ? await response.json() : null;
        judgeConfigured = response.ok && body?.configured === true;
        judgeProbe = response.ok ? (body?.configured ? 'configured' : 'no TypeSafe key') : `status ${response.status}`;
      } catch (error) {
        judgeConfigured = false;
        judgeProbe = String(error?.message ?? error).slice(0, 160);
      }
    }
    return {
      handles: Object.fromEntries(handles.map((name) => [name, Boolean(globalThis[name])])),
      judgeConfigured,
      judgeProbe,
      profileNames: profiles.map((profile) => String(profile?.name ?? '')).filter(Boolean),
      profileIds: profiles.map((profile) => String(profile?.id ?? '')).filter(Boolean),
    };
  }, { handles: needs.handles ?? [], judge: Boolean(needs.judge) });
  return { ...own, modelReachable: facts.modelReachable ?? null, modelProbe: facts.modelProbe ?? null };
}

export function b1Problems(needs: B1Needs, facts: B1Facts): string[] {
  const problems: string[] = [];
  for (const name of needs.handles ?? []) if (!facts.handles[name]) problems.push(`needs the in-page debug handle globalThis.${name}, and the page has none (stale page or extension not loaded: st-session.mts reload)`);
  if (needs.model && facts.modelReachable !== true) problems.push(`needs a lane with a live model, and the memory profile did not answer${facts.modelProbe ? ` (${facts.modelProbe})` : ''}`);
  if (needs.judge && facts.judgeConfigured !== true) problems.push(`needs the judge plugin with a TypeSafe key${facts.judgeProbe ? ` (${facts.judgeProbe})` : ''}`);
  for (const profile of needs.profiles ?? []) if (!facts.profileNames.includes(profile) && !facts.profileIds.includes(profile)) problems.push(`needs the Connection Manager profile "${profile}"`);
  return problems;
}

export function refuse(problems: string[]): { ok?: boolean; notRunnable: string[] } {
  console.log(notRunnableLine(problems));
  process.exitCode = NOT_RUNNABLE_EXIT;
  return { notRunnable: problems };
}

export async function routedProfile(page, role: string): Promise<string | null> {
  return evaluateInST(page, (role) => {
    const settings = globalThis.storyOrchestratorRuntime?.getGlobalSettings?.()?.extraction ?? null;
    const entry = settings?.profiles?.[role];
    if (typeof entry === 'string' && entry) return entry;
    if (entry && typeof entry === 'object') return entry.route?.profileId ?? entry.profileId ?? settings?.profileId ?? null;
    return settings?.profileId ?? null;
  }, role);
}

export function labellerProblems(labeller: { id: string; name: string } | null, measured: Array<{ role: string; profileId: string | null }>): string[] {
  if (!labeller) return ['needs a second-model labeller (--labeller <Connection Manager profile>): labels are never the user and never the measured model'];
  return measured.filter((entry) => entry.profileId && (entry.profileId === labeller.id || entry.profileId === labeller.name)).map((entry) => `the labeller "${labeller.name}" is the profile the ${entry.role} is measured on: a second model must label`);
}

export async function withLabeller<T>(page, profile: string, measuredRoles: string[], fn: (ask: (prompt: string, maxTokens?: number) => Promise<string>) => Promise<T>, measuredProfiles: Array<{ role: string; profileId: string }> = []): Promise<T | { ok?: boolean; notRunnable: string[] }> {
  const measured = [...await Promise.all(measuredRoles.map(async (role) => ({ role: `${role} role`, profileId: await routedProfile(page, role) }))), ...measuredProfiles];
  const pinned = await pinRoleProfile(page, LABELLER_ROLE, profile);
  try {
    const problems = labellerProblems(pinned.profile, measured);
    if (problems.length) return refuse(problems);
    return await fn(async (prompt, maxTokens = 64) => evaluateInST(page, async ({ prompt, maxTokens, role }) => {
      const reply = await globalThis.storyOrchestratorLiveSuite.askModel(prompt, maxTokens, role);
      return String(reply?.text ?? '');
    }, { prompt, maxTokens, role: LABELLER_ROLE }));
  } finally {
    await restoreRoleProfiles(page, pinned.before);
  }
}

export interface LiveRead {
  ms: number;
  tokens: number;
  scope: string[];
  sources: Array<{ kind: string; cap: number | null; keys: string[]; dropped: string[] }>;
  deltas: Array<{ q: string; v: unknown; evidence?: string }>;
  guarded: Array<{ q: string; v: unknown }>;
  facts: Array<{ text: string }>;
  rejected: Array<{ line: string; reason: string }>;
  judged: { answered: string[]; fallback?: string } | null;
  prompt: string;
  rawResponse: string;
  error?: string;
}

export async function liveRead(page, spec: Record<string, unknown>, options: { judge?: boolean } = {}): Promise<LiveRead> {
  return evaluateInST(page, async ({ spec, options }) => {
    const suite = globalThis.storyOrchestratorLiveSuite;
    const started = performance.now();
    try {
      const live = await suite.runFixture(spec, options);
      const ms = Math.round(performance.now() - started);
      const budget = await suite.measureBudget(live.prompt, 'read');
      return {
        ms, tokens: budget.estimate, scope: live.scope ?? [], sources: live.sources ?? [], deltas: live.deltas ?? [], guarded: live.guarded ?? [],
        facts: live.facts ?? [], rejected: live.rejected ?? [], judged: live.judged ?? null, prompt: live.prompt, rawResponse: live.rawResponse,
      };
    } catch (error) {
      return { ms: Math.round(performance.now() - started), tokens: 0, scope: [], sources: [], deltas: [], guarded: [], facts: [], rejected: [], judged: null, prompt: '', rawResponse: '', error: String(error?.message ?? error).slice(0, 300) };
    }
  }, { spec, options });
}

export async function withReadProfile<T>(page, profile: string | null, fn: () => Promise<T>): Promise<{ result: T; profile: { id: string; name: string } | null }> {
  if (!profile) return { result: await fn(), profile: null };
  const pinned = await pinRoleProfile(page, 'read', profile);
  try {
    return { result: await fn(), profile: pinned.profile };
  } finally {
    await restoreRoleProfiles(page, pinned.before);
  }
}

export function percentile(values: number[], share: number): number | null {
  const sorted = values.filter((value) => Number.isFinite(value)).sort((left, right) => left - right);
  return sorted.length ? sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(share * sorted.length) - 1))] : null;
}

export const ratio = (num: number, den: number): number | null => (den ? Number((num / den).toFixed(4)) : null);

export const growth = (value: number | null, base: number | null): number | null => (value === null || base === null || base <= 0 ? null : Number(((value - base) / base).toFixed(4)));

export type B1Verdict = 'PASS' | 'FAIL' | 'INCOMPLETE' | 'RECORDED';

export function combineRuns(verdicts: Array<B1Verdict | null | undefined>): B1Verdict {
  if (verdicts.length !== 2 || verdicts.some((verdict) => !verdict || verdict === 'INCOMPLETE')) return 'INCOMPLETE';
  if (verdicts.every((verdict) => verdict === 'RECORDED')) return 'RECORDED';
  return verdicts.every((verdict) => verdict === 'PASS') ? 'PASS' : 'FAIL';
}

export async function readRunRecords(paths: string[]): Promise<Array<Record<string, any>>> {
  return Promise.all(paths.map(readJsonFile));
}
