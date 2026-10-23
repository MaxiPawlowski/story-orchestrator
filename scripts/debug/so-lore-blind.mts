import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { REPO_ROOT } from '../lib/stRoot.mjs';
import { keySha256 } from './lib/modelBlindPack.mts';
import { RATER_SYSTEM, aggregateLore, buildLorePack, lorePackLeaks, parseRating, raterPrompt, type LoreKey, type LorePack, type LoreRunTask, type RaterScores } from './lib/loreBlind.mts';

const USAGE = `Usage: node scripts/debug/so-lore-blind.mts <command> [...]

v2.8 34 harvest A7: blind two-rater scoring of the wizard's lore entries, rule on vs off.

  build --run <name>=<lore-guidance output.json> [--run ...] [--out <dir>] [--seed <s>] [--force]
      take each so-wizard-agent.mts lore-guidance output, write pack.json (entries of every arm and run shuffled
      together under neutral ids E01..), pack.md, README.md and the sealed key (key.sealed.json: id -> arm, task,
      run); refuses when the pack names an arm, a task, a run or the run marker
  verify-key [--out <dir>]          recompute the key's sha256 and compare it with README.md
  rate --rater claude:<model> | opencode:<model> [--out <dir>]
      one rater over pack.json only (never the key), one entry per call in a rater-specific shuffled order;
      resumes; writes raters/<rater>/scores.json and raw replies. claude runs the claude CLI with no tools,
      no settings and no session; opencode runs opencode with tools off
  unseal [--out <dir>]              needs every entry scored by at least two raters; per run and arm: entry score =
                                    mean of the raters, arm score = median, each rater's own median, on - off

Defaults: --out test/measurements/v2.8/34/a7, raters claude:claude-opus-5-5 and claude:claude-sonnet-5-5.`;

const DEFAULT_OUT = resolve(REPO_ROOT, 'test', 'measurements', 'v2.8', '34', 'a7');
const FIXTURE = resolve(REPO_ROOT, 'test', 'measurements', 'v2.8', '34', 'lore-guidance.json');
const KEY_FILE = 'key.sealed.json';

const argValue = (args: string[], name: string) => { const at = args.indexOf(name); return at >= 0 ? args[at + 1] ?? null : null; };
const argValues = (args: string[], name: string) => args.flatMap((arg, at) => (arg === name && args[at + 1] ? [args[at + 1]] : []));
const readJson = async (path: string) => JSON.parse(await readFile(path, 'utf-8'));
const writeText = (path: string, text: string) => writeFile(path, text.replace(/\r?\n/g, '\r\n'), 'utf-8');
const writeJson = (path: string, value: unknown) => writeText(path, `${JSON.stringify(value, null, 2)}\n`);
const outDir = (args: string[]) => resolve(argValue(args, '--out') ?? DEFAULT_OUT);
const raterDir = (rater: string) => rater.replace(/[^a-z0-9.-]+/gi, '_');

export function renderLorePack(pack: LorePack): string {
  return [
    '# Blind lore pack', '', `Rubric: ${pack.rubric}`, '',
    ...pack.entries.flatMap((entry) => [`## ${entry.id} (${entry.kind}): ${entry.title}`, '', `Keys: ${entry.keys.join(', ') || '(none)'}`, '', entry.content, '']),
  ].join('\n');
}

export function loreReadme(pack: LorePack, sha: string, missing: number): string {
  return [
    '# Blind lore pack: v2.8 34 A7', '',
    `${pack.entries.length} wizard lore entries from both arms (the lore-writing rule on, and off by the measurement-only switch), shuffled together under neutral ids. ${missing} task(s) produced no entry and are not in the pack.`, '',
    'Rate with `node scripts/debug/so-lore-blind.mts rate --rater <rater>`; each rater sees one entry at a time, never the key.', '',
    `\`${KEY_FILE}\` maps each id to its arm, task and run. Its sha256 (LF line endings) is:`, '', '```', sha, '```', '',
    'Check it with `node scripts/debug/so-lore-blind.mts verify-key`; open it only through `unseal`, after every entry is scored.', '',
  ].join('\n');
}

async function build(args: string[]) {
  const out = outDir(args);
  if (existsSync(join(out, KEY_FILE)) && !args.includes('--force')) throw new Error(`${join(out, KEY_FILE)} exists: a rebuild reshuffles the ids; pass --force only before anyone has rated`);
  const named = argValues(args, '--run').map((value) => { const at = value.indexOf('='); return { run: value.slice(0, at), file: value.slice(at + 1) }; });
  if (!named.length || named.some((row) => !row.run || !row.file)) throw new Error('build needs --run <name>=<lore-guidance output.json>');
  const fixture = await readJson(FIXTURE);
  const runs = await Promise.all(named.map(async ({ run, file }) => {
    const output = await readJson(resolve(file));
    if (!Array.isArray(output.detail)) throw new Error(`${file} is not a lore-guidance output (no detail)`);
    if (output.transport?.length) throw new Error(`${file} has transport problems; a run with problems is not packed:\n- ${output.transport.join('\n- ')}`);
    return { run, tasks: output.detail.map((row: LoreRunTask) => ({ id: row.id, kind: row.kind, arm: row.arm, entry: row.entry })) };
  }));
  const seed = argValue(args, '--seed') ?? randomBytes(8).toString('hex');
  const { pack, key, missing } = buildLorePack({ seed, rubric: fixture.rubric, runs });
  const leaks = lorePackLeaks(pack, key, [fixture.marker, ...fixture.tasks.map((task: { id: string }) => task.id)]);
  if (leaks.length) throw new Error(`the pack leaks:\n- ${leaks.join('\n- ')}`);
  await mkdir(out, { recursive: true });
  const keyText = `${JSON.stringify(key, null, 2)}\n`;
  await writeText(join(out, KEY_FILE), keyText);
  await writeJson(join(out, 'pack.json'), pack);
  await writeText(join(out, 'pack.md'), renderLorePack(pack));
  await writeText(join(out, 'README.md'), loreReadme(pack, keySha256(keyText), missing.length));
  await writeJson(join(out, 'missing.json'), missing);
  return { out, entries: pack.entries.length, missing: missing.length, keySha256: keySha256(keyText) };
}

async function verifyKey(args: string[]) {
  const out = outDir(args);
  const sha = keySha256(await readFile(join(out, KEY_FILE), 'utf-8'));
  const stated = /```\r?\n([0-9a-f]{64})\r?\n```/.exec(await readFile(join(out, 'README.md'), 'utf-8'))?.[1] ?? null;
  return { keySha256: sha, readme: stated, intact: sha === stated };
}

interface RunResult { code: number; stdout: string; stderr: string }

const runProcess = (command: string, argv: string[], input: string, cwd: string, env: NodeJS.ProcessEnv = process.env) => new Promise<RunResult>((done) => {
  const child = spawn(command, argv, { cwd, env, windowsHide: true });
  let stdout = '';
  let stderr = '';
  const timer = setTimeout(() => child.kill(), 300000);
  child.stdout.on('data', (chunk) => { stdout += chunk; });
  child.stderr.on('data', (chunk) => { stderr += chunk; });
  child.on('error', (error) => { stderr += String(error); });
  child.on('close', (code) => { clearTimeout(timer); done({ code: code ?? 1, stdout, stderr }); });
  child.stdin.end(input);
});

export const claudeRaterArgv = (model: string) => ['-p', '--tools', '', '--setting-sources', '', '--strict-mcp-config', '--no-session-persistence', '--disable-slash-commands',
  '--output-format', 'json', '--model', model, '--system-prompt', RATER_SYSTEM];

export function claudeReply(stdout: string): { text: string; served: string[] } {
  try {
    const parsed = JSON.parse(stdout.trim().split(/\r?\n/).filter((line) => line.startsWith('{')).at(-1) ?? '{}');
    return { text: parsed.is_error ? '' : String(parsed.result ?? ''), served: Object.keys(parsed.modelUsage ?? {}) };
  } catch {
    return { text: '', served: [] };
  }
}

const opencodeConfig = (systemFile: string) => JSON.stringify({
  $schema: 'https://opencode.ai/config.json',
  agent: { 'so-rater': { mode: 'primary', prompt: `{file:${systemFile}}`, tools: { '*': false }, permission: { edit: 'deny', bash: 'deny', webfetch: 'deny' } } },
});

const opencodeText = (stdout: string) => stdout.split(/\r?\n/).map((line) => line.trim()).filter((line) => line.startsWith('{'))
  .map((line) => { try { return JSON.parse(line); } catch { return null; } })
  .filter((event) => event?.type === 'text').map((event) => event.part?.text ?? '').join('');

export function raterOrder(ids: string[], rater: string): string[] {
  let state = [...rater].reduce((hash, char) => (Math.imul(hash, 31) + char.charCodeAt(0)) >>> 0, 7) || 1;
  const next = () => { state ^= state << 13; state >>>= 0; state ^= state >>> 17; state ^= state << 5; state >>>= 0; return state / 0x100000000; };
  return ids.map((id) => ({ id, sort: next() })).sort((a, b) => a.sort - b.sort).map((row) => row.id);
}

async function rate(args: string[]) {
  const out = outDir(args);
  const rater = argValue(args, '--rater');
  const match = /^(claude|opencode):(.+)$/.exec(rater ?? '');
  if (!match) throw new Error('--rater claude:<model> | opencode:<model>');
  const [, cli, model] = match;
  if (/deepseek/i.test(model)) throw new Error('DeepSeek is not a rater for this measurement');
  const pack = await readJson(join(out, 'pack.json')) as LorePack;
  const dir = join(out, 'raters', raterDir(rater as string));
  await mkdir(join(dir, 'raw'), { recursive: true });
  const scoresPath = join(dir, 'scores.json');
  const scores: RaterScores = existsSync(scoresPath) ? await readJson(scoresPath) : {};
  const home = await mkdtemp(join(tmpdir(), 'so-lore-rater-'));
  const systemFile = join(home, 'system.md');
  await writeFile(systemFile, RATER_SYSTEM, 'utf-8');
  const problems: string[] = [];
  const served = new Set<string>();
  try {
    for (const id of raterOrder(pack.entries.map((entry) => entry.id), rater as string)) {
      if (typeof scores[id]?.score === 'number') continue;
      const entry = pack.entries.find((row) => row.id === id)!;
      let result: ReturnType<typeof parseRating> = { problem: 'not run' };
      for (let attempt = 1; attempt <= 2 && 'problem' in result; attempt += 1) {
        const prompt = raterPrompt(entry, pack.rubric);
        const run = cli === 'claude'
          ? await runProcess('claude', claudeRaterArgv(model), prompt, home)
          : await runProcess('opencode', ['run', '--standalone', '--format', 'json', '--agent', 'so-rater', '-m', model], prompt, home, { ...process.env, OPENCODE_CONFIG_CONTENT: opencodeConfig(systemFile) });
        const reply = cli === 'claude' ? claudeReply(run.stdout) : { text: opencodeText(run.stdout), served: [model] };
        reply.served.forEach((name) => served.add(name));
        await writeText(join(dir, 'raw', `${id}-${attempt}.txt`), `exit ${run.code}\nserved ${reply.served.join(',')}\n--- text ---\n${reply.text}\n--- stderr ---\n${run.stderr.slice(-1500)}\n`);
        result = parseRating(reply.text);
        if (!('problem' in result)) scores[id] = { score: result.score, why: result.why };
      }
      if ('problem' in result) problems.push(`${id}: ${result.problem}`);
      await writeJson(scoresPath, scores);
      console.log(`${id}: ${'problem' in result ? `FAILED ${result.problem}` : scores[id].score}`);
    }
  } finally {
    await rm(home, { recursive: true, force: true });
  }
  const wrongModel = cli === 'claude' ? [...served].filter((name) => name !== model) : [];
  if (wrongModel.length) problems.push(`the CLI served ${wrongModel.join(', ')}, not ${model}`);
  await writeJson(join(dir, 'rater.json'), { rater, cli, model, served: [...served] });
  return { rater, scored: Object.keys(scores).length, of: pack.entries.length, served: [...served], problems };
}

export function unsealedLoreMarkdown(result: ReturnType<typeof aggregateLore>, raters: string[]): string {
  const fmt = (value: number | null) => (value === null ? 'n/a' : value.toFixed(2));
  return [
    '# A7 unsealed', '',
    `Raters: ${raters.join(', ')}. Entry score = mean of the raters; arm score = median of its entries.`, '',
    ...result.runs.flatMap((run) => [
      `## ${run.run}`, '',
      ...run.arms.map((arm) => `- ${arm.arm}: ${arm.entries} entries, median ${fmt(arm.median)} (${raters.map((rater) => `${rater} ${fmt(arm.raters[rater])}`).join(', ')})`),
      `- on - off: ${fmt(run.delta)} (${raters.map((rater) => `${rater} ${fmt(run.raterDelta[rater])}`).join(', ')})`, '',
    ]),
  ].join('\n');
}

async function unseal(args: string[]) {
  const out = outDir(args);
  const pack = await readJson(join(out, 'pack.json')) as LorePack;
  const ratersRoot = join(out, 'raters');
  const raters: string[] = [];
  const scores: Record<string, RaterScores> = {};
  for (const name of existsSync(ratersRoot) ? await readdir(ratersRoot) : []) {
    const meta = await readJson(join(ratersRoot, name, 'rater.json')).catch(() => null);
    const sheet = await readJson(join(ratersRoot, name, 'scores.json')).catch(() => null);
    if (!meta || !sheet) continue;
    raters.push(meta.rater);
    scores[meta.rater] = sheet;
  }
  const missing = pack.entries.filter((entry) => raters.length < 2 || raters.some((rater) => typeof scores[rater][entry.id]?.score !== 'number')).map((entry) => entry.id);
  if (missing.length) throw new Error(`not every entry has two raters' scores (${missing.join(', ')}): the key stays sealed`);
  const key = await readJson(join(out, KEY_FILE)) as LoreKey;
  const result = aggregateLore(scores, key);
  await writeJson(join(out, 'unsealed-summary.json'), { raters, ...result });
  await writeText(join(out, 'unsealed-summary.md'), unsealedLoreMarkdown(result, raters));
  return { raters, ...result };
}

async function main() {
  const [command, ...rest] = process.argv.slice(2);
  const commands: Record<string, (args: string[]) => Promise<unknown>> = { build, 'verify-key': verifyKey, rate, unseal };
  if (!command || !commands[command]) { console.log(USAGE); process.exitCode = command ? 2 : 0; return; }
  const result = await commands[command](rest) as Record<string, unknown>;
  console.log(JSON.stringify(result, null, 2));
  if ((Array.isArray(result.problems) && result.problems.length) || result.intact === false) process.exitCode = 1;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
}
