import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEFAULT_OPENCODE, DEFAULT_RATER_MODEL, opencodeRunner, refuseModel } from './lib/promptBatchRater.mts';
import {
  ARMS, armPrompts, buildPairs, FLOORS, hashOf, judgePrompt, packLeaks, parseJudge, stability, verdict,
  type Arm, type Judged, type PairReply, type SealedKey,
} from './lib/compactionRating.mts';

const USAGE = `Usage: node scripts/debug/so-compaction-rating.mts <command> [...]

v3.0 40 (A3) blind rating: ST's message-by-message trim vs chunked history compaction, at compaction points.

  arms   --payloads <a.jsonl,b.jsonl> [--context 8192] [--read-lag 8] [--after 3] [--points 16] [--out <dir>]
         CPU. Rebuilds each recorded chat prompt both ways under a simulated prompt budget, writes points.jsonl
         (prompts, private), stability.json (prefix reuse per arm, numbers only) and manifest.json
  gen    [--out <dir>] [--url http://127.0.0.1:18888] [--seeds 1,2]
         GPU (owner "resume"). One reply per point, arm and seed from the recorded request body; resumes
  pack   [--out <dir>] [--seed <s>]       blind A/B pairs (pack.json) + sealed key (key.sealed.json)
  rate   [--out <dir>] [--model ${DEFAULT_RATER_MODEL}] [--opencode <exe>]   Sol pass over pack.json only; resumes
  score  [--out <dir>]                    unseal, aggregate, check the predeclared floors

Default --out C:/dev/so-lanes/rating/a3-compaction (outside the public repo: prompts hold chat text).
Floors (predeclared, never retuned): pairs >= ${FLOORS.minPairs}; compact preferred or tied >= ${FLOORS.preferShare};
mean overall compact - trim >= ${FLOORS.overallDelta}; mean continuity compact - trim >= ${FLOORS.continuityDelta}.`;

const DEFAULT_OUT = 'C:/dev/so-lanes/rating/a3-compaction';

const argValue = (args: string[], name: string) => { const at = args.indexOf(name); return at >= 0 ? args[at + 1] ?? null : null; };
const num = (args: string[], name: string, fallback: number) => { const value = argValue(args, name); return value === null ? fallback : Number(value); };
const writeJson = (path: string, value: unknown) => writeFile(path, `${JSON.stringify(value, null, 1)}\n`, 'utf-8');
const readJsonl = async (path: string) => (existsSync(path) ? (await readFile(path, 'utf-8')).split(/\r?\n/).filter((line) => line.trim()).map((line) => JSON.parse(line)) : []);

interface Point { id: string; chat: string; member: string; index: number; cutId: number; body: Record<string, unknown>; prompts: Record<Arm, string> }

async function arms(args: string[], out: string) {
  const files = (argValue(args, '--payloads') ?? '').split(',').filter(Boolean);
  if (!files.length) throw new Error('--payloads <file.jsonl[,…]> is required');
  const context = num(args, '--context', 8192);
  const readLag = num(args, '--read-lag', 8);
  const after = num(args, '--after', 3);
  const limit = num(args, '--points', 16);
  const rows: Array<{ chat: string; member: string; index: number; prompt: string; body: Record<string, unknown> }> = [];
  for (const file of files) {
    for (const row of await readJsonl(file)) {
      const prompt = row?.parsedBody?.prompt;
      if (typeof prompt !== 'string' || !row.draftMemberName || row.parsedBody.stream !== true) continue;
      rows.push({ chat: `${file}#${row.chatId}`, member: String(row.draftMemberName), index: Number(row.index), prompt, body: row.parsedBody });
    }
  }
  const chats = new Map<string, typeof rows>();
  rows.sort((left, right) => left.index - right.index).forEach((row) => chats.set(row.chat, [...(chats.get(row.chat) ?? []), row]));
  const sequences: Record<Arm, Map<string, string[]>> = { trim: new Map(), compact: new Map() };
  const points: Point[] = [];
  let fired = 0;
  for (const [chat, list] of chats) {
    let lastCut: number | null = null;
    let movedAt = -Infinity;
    list.forEach((row, position) => {
      const built = armPrompts(row.prompt, context, readLag);
      for (const arm of ARMS) sequences[arm].set(`${chat}|${row.member}`, [...(sequences[arm].get(`${chat}|${row.member}`) ?? []), built[arm]]);
      if (built.cutId !== null && built.cutId !== lastCut) { movedAt = position; fired += 1; lastCut = built.cutId; }
      if (built.cutId !== null && position - movedAt < after && built.trim !== built.compact) {
        points.push({ id: hashOf(`${chat}|${row.index}`).slice(0, 12), chat: hashOf(chat).slice(0, 8), member: hashOf(row.member).slice(0, 8), index: row.index, cutId: built.cutId, body: row.body, prompts: { trim: built.trim, compact: built.compact } });
      }
    });
  }
  const step = Math.max(1, Math.floor(points.length / Math.max(1, limit)));
  const chosen = points.filter((_, index) => index % step === 0).slice(0, limit);
  await mkdir(out, { recursive: true });
  await writeFile(join(out, 'points.jsonl'), chosen.map((point) => JSON.stringify(point)).join('\n') + '\n', 'utf-8');
  const stable = ARMS.map((arm) => stability([...sequences[arm].values()], arm));
  await writeJson(join(out, 'stability.json'), { context, readLag, chats: chats.size, prompts: rows.length, compactionMoves: fired, candidates: points.length, chosen: chosen.length, arms: stable });
  await writeJson(join(out, 'manifest.json'), { format: 1, plan: 'v3.0 40 A3', context, readLag, after, sources: files.map((file) => hashOf(file).slice(0, 8)), points: chosen.map((point) => point.id) });
  return { out, chats: chats.size, prompts: rows.length, compactionMoves: fired, candidates: points.length, chosen: chosen.length, stability: stable };
}

const THOUGHT = /^\s*<\|channel>[\s\S]*?<channel\|>/;

export const splitReasoning = (content: string): PairReply => {
  const match = content.match(THOUGHT);
  return match ? { text: content.slice(match[0].length).trim(), reasoning: match[0] } : { text: content.trim(), reasoning: null };
};

async function gen(args: string[], out: string) {
  const url = (argValue(args, '--url') ?? 'http://127.0.0.1:18888').replace(/\/$/, '');
  const seeds = (argValue(args, '--seeds') ?? '1,2').split(',').map(Number);
  const points = await readJsonl(join(out, 'points.jsonl')) as Point[];
  const file = join(out, 'replies.jsonl');
  const done = new Set((await readJsonl(file)).map((row) => `${row.id}|${row.arm}|${row.seed}`));
  let written = 0;
  for (const point of points) for (const seed of seeds) for (const arm of ARMS) {
    if (done.has(`${point.id}|${arm}|${seed}`)) continue;
    const response = await fetch(`${url}/completion`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...point.body, prompt: point.prompts[arm], seed, stream: false, cache_prompt: false }) });
    if (!response.ok) throw new Error(`${url}/completion answered ${response.status} for ${point.id} ${arm} seed ${seed}`);
    const reply = splitReasoning(String((await response.json())?.content ?? ''));
    await writeFile(file, `${JSON.stringify({ id: point.id, arm, seed, ...reply })}\n`, { encoding: 'utf-8', flag: 'a' });
    written += 1;
  }
  return { out, written };
}

async function pack(args: string[], out: string) {
  const seed = argValue(args, '--seed') ?? hashOf(String(Date.now())).slice(0, 16);
  const points = new Map((await readJsonl(join(out, 'points.jsonl')) as Point[]).map((point) => [point.id, point]));
  const replies = new Map<string, Partial<Record<Arm, PairReply>>>();
  for (const row of await readJsonl(join(out, 'replies.jsonl'))) {
    const id = `${row.id}-s${row.seed}`;
    replies.set(id, { ...replies.get(id), [row.arm]: { text: row.text, reasoning: row.reasoning } });
  }
  const complete = [...replies].flatMap(([id, pair]) => (pair.trim && pair.compact && points.has(id.replace(/-s\d+$/, '')) ? [{ id, prompt: points.get(id.replace(/-s\d+$/, ''))!.prompts.trim, replies: pair as Record<Arm, PairReply> }] : []));
  const built = buildPairs(seed, complete);
  const leaks = packLeaks(built.pairs);
  if (leaks.length) throw new Error(`pack names an arm: ${leaks.join(', ')}`);
  const keyText = JSON.stringify(built.key, null, 1);
  await writeJson(join(out, 'pack.json'), { format: 1, pairs: built.pairs });
  await writeFile(join(out, 'key.sealed.json'), keyText, 'utf-8');
  await writeFile(join(out, 'README.md'), `# A3 blind pack\n\n${built.pairs.length} pairs. Key sha256 ${hashOf(keyText)}. Rate pack.json only; key.sealed.json opens at score.\n`, 'utf-8');
  return { out, pairs: built.pairs.length, keySha256: hashOf(keyText) };
}

async function rate(args: string[], out: string) {
  const model = argValue(args, '--model') ?? DEFAULT_RATER_MODEL;
  refuseModel(model);
  const { pairs } = JSON.parse(await readFile(join(out, 'pack.json'), 'utf-8'));
  const home = await mkdtemp(join(tmpdir(), 'so-a3-rate-'));
  const system = join(home, 'system.txt');
  await writeFile(system, 'You are a careful, impartial rater of interactive roleplay fiction. You answer with exactly one JSON object.', 'utf-8');
  const run = opencodeRunner(argValue(args, '--opencode') ?? DEFAULT_OPENCODE, model, home, system);
  await mkdir(join(out, 'judge'), { recursive: true });
  let rated = 0;
  const problems: string[] = [];
  try {
    for (const pair of pairs) {
      const target = join(out, 'judge', `${pair.id}.json`);
      if (existsSync(target)) continue;
      const promptFile = join(home, `${pair.id}.txt`);
      await writeFile(promptFile, judgePrompt(pair), 'utf-8');
      const answer = await run(promptFile);
      const parsed = parseJudge(answer.text);
      if ('problem' in parsed) { problems.push(`${pair.id}: ${parsed.problem}`); continue; }
      await writeJson(target, { model, ...parsed });
      rated += 1;
    }
  } finally {
    await rm(home, { recursive: true, force: true });
  }
  return { out, model, rated, problems };
}

async function score(out: string) {
  const key = JSON.parse(await readFile(join(out, 'key.sealed.json'), 'utf-8')) as SealedKey;
  const { pairs } = JSON.parse(await readFile(join(out, 'pack.json'), 'utf-8')) as { pairs: Array<{ id: string }> };
  const judged: Record<string, Judged> = {};
  for (const pair of pairs) {
    const file = join(out, 'judge', `${pair.id}.json`);
    if (existsSync(file)) judged[pair.id] = JSON.parse(await readFile(file, 'utf-8'));
  }
  const result = verdict(judged, key);
  await writeJson(join(out, 'verdict.json'), { floors: FLOORS, ...result });
  return result;
}

export async function main(argv: string[]) {
  const [command, ...args] = argv;
  const out = argValue(args, '--out') ?? DEFAULT_OUT;
  if (command === 'arms') return arms(args, out);
  if (command === 'gen') return gen(args, out);
  if (command === 'pack') return pack(args, out);
  if (command === 'rate') return rate(args, out);
  if (command === 'score') return score(out);
  console.log(USAGE);
  return null;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).then((result) => { if (result) console.log(JSON.stringify(result, null, 1)); }).catch((error) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
}
