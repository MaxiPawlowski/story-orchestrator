import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { readManifest, readResponses, sha256 } from './promptBatch.mts';
import type { MeasureArgs } from './promptBatchMeasures.mts';

export const DEFAULT_RATER_MODEL = 'openai/gpt-6.1-sol';
export const DEFAULT_OPENCODE = 'C:/Users/RolaPorElNapo/bin/opencode/opencode.exe';
export const RATER_AGENT = 'so-rater';
export const RATER_SYSTEM = 'You are a careful, impartial rater of suggestions in interactive roleplay fiction. You answer with exactly one JSON object.';
export const RATER_MESSAGE = 'Follow the instructions in the attached file. Answer with the JSON object only.';

export function refuseModel(model: string): void {
  if (/-fast\b/i.test(model)) throw new Error(`refused: ${model} is a -fast variant`);
  if (/deepseek/i.test(model)) throw new Error(`refused: ${model}; this rater runs on Sol, DeepSeek is not used here`);
}

export interface PlayerView { sections?: Array<{ label: string; lines: string[] }>; transcript?: Array<{ name: string; mes: string }> }

export const renderPlayerView = (view: PlayerView | null): string => [
  ...(view?.sections ?? []).map((section) => `${section.label}:\n${section.lines.map((line) => `- ${line}`).join('\n')}`),
  ...((view?.transcript ?? []).length ? [`Recent messages:\n${(view?.transcript ?? []).map((line) => `${line.name}: ${line.mes}`).join('\n')}`] : []),
].join('\n\n') || '(nothing shown)';

const PLACEHOLDER = /\{(premise|playerView|hiddenFacts|set1|set2|anchor|line)\}/g;

export const fillTemplate = (template: string, values: Partial<Record<string, string>>): string =>
  template.replace(PLACEHOLDER, (whole, key: string) => values[key] ?? whole);

export const renderSet = (lines: readonly string[]): string => (lines.length ? lines.map((line, index) => `${index + 1}. ${line}`).join('\n') : '(no suggestions came back)');

export const hiddenFacts = (bait: string | undefined, needles: readonly string[] | undefined): string =>
  (bait ? `${bait}${needles?.length ? ` (key phrases: ${needles.join('; ')})` : ''}` : '(none)');

export function jsonAnswer(text: string): Record<string, any> | null {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
}

export interface SetRating { lines: Array<{ usable: boolean; leak: boolean }>; usefulness: number }

const setRating = (value: any, size: number): SetRating | string => {
  if (!value || !Array.isArray(value.lines)) return 'no lines array';
  if (value.lines.length !== size) return `${value.lines.length} line verdicts for ${size} lines`;
  if (value.lines.some((line: any) => typeof line?.usable !== 'boolean' || typeof line?.leak !== 'boolean')) return 'a line verdict lacks usable/leak booleans';
  if (!Number.isInteger(value.usefulness) || value.usefulness < 1 || value.usefulness > 5) return `usefulness ${JSON.stringify(value.usefulness)} is not 1-5`;
  return { lines: value.lines.map((line: any) => ({ usable: line.usable, leak: line.leak })), usefulness: value.usefulness };
};

export function readPassA(text: string, sizes: [number, number]): { set1: SetRating; set2: SetRating; notes: string | null } | { problem: string } {
  const answer = jsonAnswer(text);
  if (!answer) return { problem: 'no JSON object in the answer' };
  const set1 = setRating(answer.set1, sizes[0]);
  const set2 = setRating(answer.set2, sizes[1]);
  if (typeof set1 === 'string') return { problem: `set1: ${set1}` };
  if (typeof set2 === 'string') return { problem: `set2: ${set2}` };
  return { set1, set2, notes: typeof answer.notes === 'string' ? answer.notes : null };
}

export function readPassB(text: string): { engages: boolean; why: string | null } | { problem: string } {
  const answer = jsonAnswer(text);
  if (!answer || typeof answer.engages !== 'boolean') return { problem: 'no {"engages": boolean} in the answer' };
  return { engages: answer.engages, why: typeof answer.why === 'string' ? answer.why : null };
}

export type RaterRunner = (promptFile: string) => Promise<{ code: number; text: string; stderr: string }>;

const opencodeConfig = (systemFile: string) => JSON.stringify({
  $schema: 'https://opencode.ai/config.json',
  agent: { [RATER_AGENT]: { mode: 'primary', prompt: `{file:${systemFile}}`, tools: { '*': false }, permission: { edit: 'deny', bash: 'deny', webfetch: 'deny' } } },
});

export const opencodeText = (stdout: string) => stdout.split(/\r?\n/).map((line) => line.trim()).filter((line) => line.startsWith('{'))
  .map((line) => { try { return JSON.parse(line); } catch { return null; } })
  .filter((event) => event?.type === 'text').map((event) => event.part?.text ?? '').join('');

export function opencodeRunner(exe: string, model: string, home: string, systemFile: string, timeoutMs = 300_000): RaterRunner {
  refuseModel(model);
  return (promptFile) => new Promise((done) => {
    const child = spawn(exe, ['run', '--standalone', '--format', 'json', '-m', model, '--agent', RATER_AGENT, '--file', promptFile, RATER_MESSAGE], {
      cwd: home, env: { ...process.env, OPENCODE_CONFIG_CONTENT: opencodeConfig(systemFile) }, windowsHide: true,
    });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => child.kill(), timeoutMs);
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('error', (error) => { clearTimeout(timer); done({ code: 1, text: '', stderr: error.message }); });
    child.on('close', (code) => { clearTimeout(timer); done({ code: code ?? 1, text: opencodeText(stdout), stderr }); });
    child.stdin.end();
  });
}

export interface RaterState {
  passA: Record<string, Partial<Record<'current' | 'anchored', SetRating>>>;
  passB: Record<string, { engages: boolean; why: string | null }>;
  routes: Record<string, number>;
}

const RATER_DIR = 'rater';

export async function readRater(dir: string): Promise<RaterState> {
  const state: RaterState = { passA: {}, passB: {}, routes: {} };
  const root = join(dir, RATER_DIR);
  for (const pass of ['passA', 'passB'] as const) {
    if (!existsSync(join(root, pass))) continue;
    for (const name of (await readdir(join(root, pass))).filter((file) => file.endsWith('.json'))) {
      const row = JSON.parse(await readFile(join(root, pass, name), 'utf-8'));
      state.routes[row.model] = (state.routes[row.model] ?? 0) + 1;
      if (pass === 'passA') state.passA[row.situation] = { [row.set1]: row.set1Rating, [row.set1 === 'anchored' ? 'current' : 'anchored']: row.set2Rating };
      else state.passB[`${row.situation}#${row.line}`] = { engages: row.engages, why: row.why };
    }
  }
  return state;
}

const writeJson = (path: string, value: unknown) => writeFile(path, `${JSON.stringify(value, null, 1)}\n`, 'utf-8');

export async function rate(dir: string, args: MeasureArgs, injected?: RaterRunner) {
  const manifest = await readManifest(dir);
  if (manifest.measurement !== 'lt06') throw new Error(`rate is for lt06 batches, this one is ${manifest.measurement}`);
  const model = typeof args.model === 'string' ? args.model : DEFAULT_RATER_MODEL;
  refuseModel(model);
  const pass = typeof args.pass === 'string' ? args.pass : 'both';
  if (!['A', 'B', 'both'].includes(pass)) throw new Error('--pass A|B|both');
  const limit = typeof args.limit === 'string' ? Number(args.limit) : Infinity;
  const scenarios = await import('./promptBatchScenarios.mts');
  const { loadBatchKit } = await import('./promptBatchMeasures.mts');
  const corpus = await scenarios.ltCorpus(typeof manifest.args['corpus-dir'] === 'string' ? manifest.args['corpus-dir'] : scenarios.LT_DIR);
  if (manifest.args.corpus !== corpus.corpusSha) throw new Error(`refused: the batch was captured on corpus ${manifest.args.corpus}, the corpus on disk is ${corpus.corpusSha}`);
  const rows = await scenarios.ltRows(dir, manifest, await readResponses(dir), await loadBatchKit());
  const root = join(dir, RATER_DIR);
  for (const sub of ['passA', 'passB', 'prompts', 'raw']) await mkdir(join(root, sub), { recursive: true });
  const home = await mkdtemp(join(tmpdir(), 'so-rater-'));
  const systemFile = join(home, 'system.md');
  await writeFile(systemFile, RATER_SYSTEM, 'utf-8');
  const runner = injected ?? opencodeRunner(typeof args.opencode === 'string' ? args.opencode : process.env.SO_OPENCODE ?? DEFAULT_OPENCODE, model, home, systemFile);
  const problems: string[] = [];
  const done = { passA: { ran: 0, kept: 0, skipped: [] as string[] }, passB: { ran: 0, kept: 0 } };
  let budget = limit;
  const ask = async <T,>(name: string, prompt: string, read: (text: string) => T | { problem: string }): Promise<T | null> => {
    const file = join(root, 'prompts', `${name}.md`);
    await writeFile(file, prompt, 'utf-8');
    let last = 'not run';
    for (const attempt of [1, 2]) {
      budget -= attempt === 1 ? 1 : 0;
      const run = await runner(file);
      await writeFile(join(root, 'raw', `${name}-${attempt}.txt`), `exit ${run.code}\n--- text ---\n${run.text}\n--- stderr ---\n${run.stderr.slice(-2000)}\n`, 'utf-8');
      const parsed = read(run.text);
      if (!(parsed && typeof parsed === 'object' && 'problem' in parsed)) return parsed as T;
      last = (parsed as { problem: string }).problem;
    }
    problems.push(`${name}: ${last}`);
    return null;
  };
  const item = (id: string) => manifest.items.find((entry) => entry.id === id);
  try {
    for (const situation of corpus.situations) {
      const anchored = rows.find((row) => row.situation === situation.id && row.arm === 'anchored');
      const current = rows.find((row) => row.situation === situation.id && row.arm === 'current');
      if (!anchored || !current) continue;
      const viewA = await scenarios.ltPlayerView(dir, item(anchored.id) as never);
      const viewC = await scenarios.ltPlayerView(dir, item(current.id) as never);
      const view = renderPlayerView(viewA as PlayerView | null);
      if (pass !== 'B' && !existsSync(join(root, 'passA', `${situation.id}.json`))) {
        if (!anchored.answered || !current.answered) done.passA.skipped.push(`${situation.id}: an arm has no response`);
        else if (!isDeepStrictEqual(viewA, viewC)) {
          done.passA.skipped.push(`${situation.id}: the arms' player views differ`);
          problems.push(`${situation.id}: the arms' player views differ (the seeds did not land the same)`);
        } else if (budget > 0) {
          const first = scenarios.anchoredFirst(corpus.corpusSha, situation.id);
          const [one, two] = first ? [anchored, current] : [current, anchored];
          const texts = (row: typeof anchored) => row.shown.map((line) => line.text);
          const prompt = fillTemplate(corpus.frozen.rater.passA.prompt, { premise: situation.premise, playerView: view, hiddenFacts: hiddenFacts(situation.bait, situation.leakNeedles), set1: renderSet(texts(one)), set2: renderSet(texts(two)) });
          done.passA.ran += 1;
          const answer = await ask(`A-${situation.id}`, prompt, (textValue) => readPassA(textValue, [one.shown.length, two.shown.length]));
          if (answer) {
            done.passA.kept += 1;
            await writeJson(join(root, 'passA', `${situation.id}.json`), { situation: situation.id, model, set1: one.arm, set1Rating: answer.set1, set2Rating: answer.set2, notes: answer.notes, promptSha: sha256(prompt), at: new Date().toISOString() });
          }
        }
      }
      if (pass === 'A') continue;
      for (const [index, line] of anchored.shown.entries()) {
        if (!line.anchor || existsSync(join(root, 'passB', `${situation.id}-${index}.json`)) || budget <= 0) continue;
        const prompt = fillTemplate(corpus.frozen.rater.passB.prompt, { playerView: view, anchor: line.anchor, line: line.text });
        done.passB.ran += 1;
        const answer = await ask(`B-${situation.id}-${index}`, prompt, readPassB);
        if (answer) {
          done.passB.kept += 1;
          await writeJson(join(root, 'passB', `${situation.id}-${index}.json`), { situation: situation.id, line: index, model, anchor: line.anchor, text: line.text, engages: answer.engages, why: answer.why, promptSha: sha256(prompt), at: new Date().toISOString() });
        }
      }
    }
  } finally {
    await rm(home, { recursive: true, force: true });
  }
  return { model, pass, ...done, problems };
}
