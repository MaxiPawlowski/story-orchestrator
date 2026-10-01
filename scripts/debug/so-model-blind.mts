import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { REPO_ROOT } from '../lib/stRoot.mjs';
import {
  aggregateByConfig, buildModelPack, CRITERIA, CRITERIA_TEXT, judgePrompt, keySha256, LETTERS, modelPackLeaks, parseJudgeReply, ratingSheet, renderPackMarkdown,
  type Criterion, type Letter, type Pack, type ReplyRow, type SealedKey,
} from './lib/modelBlindPack.mts';

const USAGE = `Usage: node scripts/debug/so-model-blind.mts <command> [...]

Plan 15 blind model pack (A100 experiment, blind-20): 20 real turns x 4 configs, unlabelled.

  build [--kit <dir>] [--out <dir>] [--seed <s>]
      read <kit>/testset/blind-20 (context) and <kit>/results/blind-20/replies.jsonl, write pack.json,
      pack.md, rating-sheet.csv and README.md, and the sealed key (key.sealed.json, letter -> config);
      refuses when the pack names a config, a source turn or a template marker
  verify-key [--out <dir>]          recompute the key's sha256 and compare it with README.md
  judge [--out <dir>] [--model <m>]  opencode first pass over pack.json only (never the key); resumes
  unseal-judge [--out <dir>]        per-config aggregate of the judge's scores, opened with the key

Defaults: --kit C:/dev/so-lanes/artemis-flags, --out test/sessions/rating-pack/model-blind-20,
--model openai/gpt-6-astra.`;

const DEFAULT_KIT = 'C:/dev/so-lanes/artemis-flags';
const DEFAULT_OUT = resolve(REPO_ROOT, 'test', 'sessions', 'rating-pack', 'model-blind-20');
const DEFAULT_MODEL = 'openai/gpt-6-astra';
const KEY_FILE = 'key.sealed.json';
const JUDGE_DIR = 'judge-first-pass';

const argValue = (args: string[], name: string) => { const at = args.indexOf(name); return at >= 0 ? args[at + 1] ?? null : null; };
const readJson = async (path: string) => JSON.parse(await readFile(path, 'utf-8'));
const writeText = (path: string, text: string) => writeFile(path, text.replace(/\r?\n/g, '\r\n'), 'utf-8');
const writeJson = (path: string, value: unknown) => writeText(path, `${JSON.stringify(value, null, 2)}\n`);

export function readme(pack: Pack, sha: string, configCount: number): string {
  return [
    '# Blind model pack: 20 turns x 4 replies',
    '',
    `Built for the plan 14 review (item 1 of \`docs/plans/v2.6/14-review-pack.md\`). Each of the ${pack.turns.length} turns is a real moment from the T0/T1 Adolion sessions; each was answered by ${configCount} different server/model setups from the A100 experiment. The replies are labelled A–D in a random order that is drawn **independently for every turn**, so "A" is not the same setup from one turn to the next.`,
    '',
    '## How to rate',
    '',
    '1. Read `pack.md` turn by turn: the situation lines, the recent chat, then replies A–D.',
    '2. Fill in `rating-sheet.csv` (one row per turn and reply). Score each reply 1 (bad) to 5 (excellent) on:',
    ...CRITERIA.map((criterion) => `   - \`${criterion}_1to5\` — ${CRITERIA_TEXT[criterion]}`),
    '   - `rank_1to4` — your order for the turn, 1 = best (no ties).',
    '   - `note` — optional.',
    '3. Partial sheets are fine; skip a column you do not want to judge. Ranking alone is enough if time is short.',
    '',
    'A reply marked *(cut off at the length limit)* ran to the 600-token cap; judge what is there.',
    '',
    '## The key stays sealed until you have rated',
    '',
    `\`${KEY_FILE}\` maps each turn's letters to the setups and records the shuffle seed. Do not open it before your sheet is done. Its sha256 (LF line endings) is:`,
    '',
    '```',
    sha,
    '```',
    '',
    'Check it has not been touched: `node scripts/debug/so-model-blind.mts verify-key`.',
    '',
    `A judge model scored the same pack blind first. Its output lives in \`${JUDGE_DIR}/\`, and its per-setup result in \`${JUDGE_DIR}/unsealed-summary.md\` is unsealed — read it only after rating, or it will steer you.`,
    '',
  ].join('\n');
}

async function build(args: string[]) {
  const kit = argValue(args, '--kit') ?? DEFAULT_KIT;
  const out = resolve(argValue(args, '--out') ?? DEFAULT_OUT);
  if (existsSync(join(out, KEY_FILE)) && !args.includes('--force')) throw new Error(`${join(out, KEY_FILE)} exists: a rebuild reshuffles the letters; pass --force only before anyone has rated`);
  const seed = argValue(args, '--seed') ?? randomBytes(8).toString('hex');
  const manifest = await readJson(join(kit, 'testset', 'blind-20', 'manifest.json')) as Array<{ id: string; variants: { gemma: { file: string } } }>;
  const bodies = await Promise.all(manifest.map(async (entry) => ({ body: entry.id, prompt: String((await readJson(join(kit, 'testset', 'blind-20', entry.variants.gemma.file))).prompt) })));
  const replies = (await readFile(join(kit, 'results', 'blind-20', 'replies.jsonl'), 'utf-8')).split(/\r?\n/).filter((line) => line.trim()).map((line) => JSON.parse(line) as ReplyRow);
  const { pack, key } = buildModelPack({ seed, bodies, replies });
  const leaks = modelPackLeaks(pack, key);
  if (leaks.length) throw new Error(`the pack leaks:\n- ${leaks.join('\n- ')}`);
  await mkdir(out, { recursive: true });
  const keyText = `${JSON.stringify(key, null, 2)}\n`;
  await writeText(join(out, KEY_FILE), keyText);
  await writeJson(join(out, 'pack.json'), pack);
  await writeText(join(out, 'pack.md'), renderPackMarkdown(pack));
  await writeText(join(out, 'rating-sheet.csv'), ratingSheet(pack));
  await writeText(join(out, 'README.md'), readme(pack, keySha256(keyText), key.configs.length));
  return { out, turns: pack.turns.length, configs: key.configs.length, keySha256: keySha256(keyText) };
}

async function verifyKey(args: string[]) {
  const out = resolve(argValue(args, '--out') ?? DEFAULT_OUT);
  const sha = keySha256(await readFile(join(out, KEY_FILE), 'utf-8'));
  const stated = /```\r?\n([0-9a-f]{64})\r?\n```/.exec(await readFile(join(out, 'README.md'), 'utf-8'))?.[1] ?? null;
  return { keySha256: sha, readme: stated, intact: sha === stated };
}

const opencodeConfig = (systemFile: string) => JSON.stringify({
  $schema: 'https://opencode.ai/config.json',
  agent: { 'so-judge': { mode: 'primary', prompt: `{file:${systemFile}}`, tools: { '*': false }, permission: { edit: 'deny', bash: 'deny', webfetch: 'deny' } } },
});

const JUDGE_SYSTEM = 'You are a careful, impartial reader of roleplay fiction. You answer with exactly one JSON object.';

function runOpencode(model: string, prompt: string, cwd: string, systemFile: string) {
  return new Promise<{ code: number; stdout: string; stderr: string }>((done) => {
    const child = spawn('opencode', ['run', '--pure', '--format', 'json', '--agent', 'so-judge', '-m', model, '--dir', cwd], {
      cwd, env: { ...process.env, OPENCODE_CONFIG_CONTENT: opencodeConfig(systemFile) }, windowsHide: true,
    });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => child.kill(), 300000);
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('close', (code) => { clearTimeout(timer); done({ code: code ?? 1, stdout, stderr }); });
    child.stdin.end(prompt);
  });
}

const opencodeText = (stdout: string) => stdout.split(/\r?\n/).map((line) => line.trim()).filter((line) => line.startsWith('{'))
  .map((line) => { try { return JSON.parse(line); } catch { return null; } })
  .filter((event) => event?.type === 'text').map((event) => event.part?.text ?? '').join('');

async function judge(args: string[]) {
  const out = resolve(argValue(args, '--out') ?? DEFAULT_OUT);
  const model = argValue(args, '--model') ?? DEFAULT_MODEL;
  const pack = await readJson(join(out, 'pack.json')) as Pack;
  const dir = join(out, JUDGE_DIR);
  await mkdir(join(dir, 'raw'), { recursive: true });
  await writeText(join(dir, 'prompt.md'), [
    '# Judge first pass: prompt', '', `Model: \`${model}\` via \`opencode run --pure\` (tools off, no login step; the CLI's existing provider auth).`, '',
    'System text:', '', '```text', JUDGE_SYSTEM, '```', '', 'Per-turn prompt (T01 shown; every turn uses the same template over its own context and replies):', '', '```text', judgePrompt(pack.turns[0]), '```', '',
  ].join('\n'));
  const scoresPath = join(dir, 'scores.json');
  const scores: Record<string, unknown> = existsSync(scoresPath) ? await readJson(scoresPath) : {};
  const home = await mkdtemp(join(tmpdir(), 'so-judge-'));
  const systemFile = join(home, 'system.md');
  await writeFile(systemFile, JUDGE_SYSTEM, 'utf-8');
  const problems: string[] = [];
  try {
    for (const turn of pack.turns) {
      if ((scores[turn.id] as any)?.rank) continue;
      let result: ReturnType<typeof parseJudgeReply> = { problem: 'not run' };
      for (let attempt = 1; attempt <= 2; attempt += 1) {
        const run = await runOpencode(model, judgePrompt(turn), home, systemFile);
        const text = opencodeText(run.stdout);
        await writeText(join(dir, 'raw', `${turn.id}-${attempt}.txt`), `exit ${run.code}\n--- text ---\n${text}\n--- stderr ---\n${run.stderr.slice(-2000)}\n`);
        result = parseJudgeReply(text);
        if (!('problem' in result)) { scores[turn.id] = { ...result, model, attempt, why: (() => { try { return JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1)).why ?? null; } catch { return null; } })() }; break; }
      }
      if ('problem' in result) problems.push(`${turn.id}: ${result.problem}`);
      await writeJson(scoresPath, scores);
      console.log(`${turn.id}: ${'problem' in result ? `FAILED ${result.problem}` : (scores[turn.id] as any).rank.join(' > ')}`);
    }
  } finally {
    await rm(home, { recursive: true, force: true });
  }
  return { scored: Object.keys(scores).length, of: pack.turns.length, problems };
}

export function unsealedMarkdown(model: string, rows: ReturnType<typeof aggregateByConfig>, turns: number): string {
  const head = ['config', 'turns', ...CRITERIA.map((criterion) => `mean ${criterion}`), 'mean rank (1 best)', 'first places'];
  return [
    '# Judge first pass, unsealed',
    '',
    `Opened with \`key.sealed.json\` **after** the judge scored all ${turns} turns blind (\`scores.json\`, letters only). Judge: \`${model}\`. Read this only after your own rating.`,
    '',
    `| ${head.join(' | ')} |`,
    `| ${head.map(() => '---').join(' | ')} |`,
    ...rows.map((row) => `| ${[row.config, row.turns, ...CRITERIA.map((criterion) => row.mean[criterion].toFixed(2)), row.meanRank.toFixed(2), row.firstPlaces].join(' | ')} |`),
    '',
    `Preferred (lowest mean rank): **${rows[0]?.config ?? 'none'}**.`,
    '',
  ].join('\n');
}

async function unsealJudge(args: string[]) {
  const out = resolve(argValue(args, '--out') ?? DEFAULT_OUT);
  const dir = join(out, JUDGE_DIR);
  const pack = await readJson(join(out, 'pack.json')) as Pack;
  const scores = await readJson(join(dir, 'scores.json')) as Record<string, { scores: Record<Letter, Record<Criterion, number>>; rank: Letter[]; model: string }>;
  const missing = pack.turns.filter((turn) => !scores[turn.id]?.rank).map((turn) => turn.id);
  if (missing.length) throw new Error(`the judge has not scored ${missing.join(', ')}: the key stays sealed until every turn is scored`);
  const key = await readJson(join(out, KEY_FILE)) as SealedKey;
  const rows = aggregateByConfig(scores, key);
  const model = Object.values(scores)[0]?.model ?? 'unknown';
  await writeJson(join(dir, 'unsealed-summary.json'), { model, turns: pack.turns.length, letters: LETTERS, rows });
  await writeText(join(dir, 'unsealed-summary.md'), unsealedMarkdown(model, rows, pack.turns.length));
  return { preferred: rows[0]?.config ?? null, rows };
}

async function main() {
  const [command, ...rest] = process.argv.slice(2);
  const commands: Record<string, (args: string[]) => Promise<unknown>> = { build, 'verify-key': verifyKey, judge, 'unseal-judge': unsealJudge };
  if (!command || !commands[command]) { console.log(USAGE); process.exitCode = command ? 2 : 0; return; }
  const result = await commands[command](rest) as Record<string, unknown>;
  console.log(JSON.stringify(result, null, 2));
  if ((Array.isArray(result.problems) && result.problems.length) || result.intact === false) process.exitCode = 1;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
}
