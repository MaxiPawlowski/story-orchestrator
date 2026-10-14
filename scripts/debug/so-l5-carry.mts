import { spawn } from 'node:child_process';
import { appendFileSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { draftInputs, parseRatings, ratePrompt, readChat, score, type CarryInputLike, type CarryItem, type Rating } from './lib/l5Carry.mts';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const MODEL = 'openai/gpt-6.1-sol';
const USAGE = 'usage: so-l5-carry.mts pick --chat <chat.jsonl> --out <items.json> | rate --items <items.json> --out <ratings.jsonl> [--batch 10] [--max-calls 50] | score --items <items.json> --ratings <ratings.jsonl>';

const arg = (name: string, fallback?: string): string => {
  const at = process.argv.indexOf(`--${name}`);
  const value = at >= 0 ? process.argv[at + 1] : fallback;
  if (value === undefined) throw new Error(`missing --${name}\n${USAGE}`);
  return value;
};

type Picker = (input: CarryInputLike) => { line: string; reason?: string; messageId?: number };

const loadPicker = async (): Promise<Picker> => {
  const dir = mkdtempSync(join(tmpdir(), 'so-l5-carry-'));
  const outfile = join(dir, 'thoughtCarry.mjs');
  try {
    await build({ entryPoints: [join(ROOT, 'src', 'runtime', 'spikes', 'thoughtCarry.ts')], bundle: true, platform: 'node', format: 'esm', outfile, logLevel: 'warning', tsconfig: join(ROOT, 'tsconfig.json') });
    const module = await import(pathToFileURL(outfile).href) as { pickCarry: Picker };
    return module.pickCarry;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
};

const pick = async () => {
  const pickCarry = await loadPicker();
  const items: CarryItem[] = draftInputs(readChat(readFileSync(arg('chat'), 'utf8'))).map(({ messageId, member, input, reasoning }) => {
    const result = pickCarry(input);
    return { key: `m${messageId}`, messageId, member, line: result.line, reason: result.line ? null : result.reason ?? null, reasoning };
  });
  writeFileSync(arg('out'), `${JSON.stringify(items, null, 2)}\n`);
  const carried = items.filter((item) => item.line).length;
  console.log(JSON.stringify({ replies: items.length, carried }));
};

const callOnce = (prompt: string) => new Promise<string>((done) => {
  const dir = mkdtempSync(join(tmpdir(), 'so-l5-rate-'));
  const file = join(dir, 'batch.txt');
  writeFileSync(file, prompt);
  const child = spawn('opencode', ['run', '-m', MODEL, '-f', file, 'Rate every item in the attached file exactly as it instructs. Reply with the JSON only.'], { shell: false, windowsHide: true });
  let stdout = '';
  child.stdin.end();
  child.stdout.on('data', (chunk) => { stdout += chunk; });
  child.stderr.on('data', () => {});
  const timer = setTimeout(() => child.kill(), 300000);
  const finish = () => { clearTimeout(timer); rmSync(dir, { recursive: true, force: true }); done(stdout); };
  child.on('close', finish);
  child.on('error', finish);
});

const rate = async () => {
  const items = (JSON.parse(readFileSync(arg('items'), 'utf8')) as CarryItem[]).filter((item) => item.line);
  const out = arg('out');
  const size = Number(arg('batch', '10'));
  const maxCalls = Number(arg('max-calls', '50'));
  const done = new Set(existsSync(out) ? readFileSync(out, 'utf8').split('\n').filter(Boolean).map((line) => JSON.parse(line) as Partial<Rating>).map((row) => row.key).filter(Boolean) : []);
  const queue = items.filter((item) => !done.has(item.key));
  let calls = 0;
  for (let at = 0; at < queue.length && calls < maxCalls; at += size) {
    let batch = queue.slice(at, at + size);
    for (let attempt = 1; attempt <= 2 && batch.length && calls < maxCalls; attempt += 1) {
      calls += 1;
      const ratings = parseRatings(await callOnce(ratePrompt(batch))).filter((rating) => batch.some((item) => item.key === rating.key));
      for (const rating of ratings) appendFileSync(out, `${JSON.stringify(rating)}\n`);
      batch = batch.filter((item) => !ratings.some((rating) => rating.key === item.key));
    }
  }
  console.log(JSON.stringify({ toRate: queue.length, calls, model: MODEL }));
};

const scoreCmd = () => {
  const items = JSON.parse(readFileSync(arg('items'), 'utf8')) as CarryItem[];
  const ratings = readFileSync(arg('ratings'), 'utf8').split('\n').filter(Boolean).map((line) => JSON.parse(line) as Rating).filter((row) => typeof row.key === 'string');
  const result = score(items, ratings);
  console.log(JSON.stringify(result, null, 2));
  if (result.verdict !== 'pass') process.exitCode = 1;
};

const verb = process.argv[2];
if (verb === 'pick') await pick();
else if (verb === 'rate') await rate();
else if (verb === 'score') scoreCmd();
else throw new Error(USAGE);
