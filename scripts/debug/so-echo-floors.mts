import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeFile } from 'node:fs/promises';
import { parsePrompt } from './lib/compactionRating.mts';
import { echoRate, echoVerdict, specificity, ECHO_FLOORS, type EchoSample } from './lib/echoFloors.mts';
import { loudChats, newReplies, readJsonl, turnText } from './lib/payloadChats.mts';

const USAGE = `Usage: node scripts/debug/so-echo-floors.mts <command> [...]

v3.0 43 C item 3 (memory-rp-community P2): code-computed echo and vagueness floors for any rating where history leaves
the prompt (A3-R compaction, H33-RP deferred threads). No model call.
  score    --out <rating dir> [--base trim] [--arm compact]
           reads points.jsonl + replies.jsonl of a so-compaction-rating dir (or any dir of the same shape), writes echo.json
  baseline --payloads <a.jsonl[,b.jsonl]>
           recorded replies against their own chat: echo rate and specificity, counts only

echo rate = share of reply ${8}-grams also found in chat messages 15-40 back; specificity = named words + numbers per 100
reply words. Floors (predeclared, never retuned): arm echo <= base + ${ECHO_FLOORS.echoDelta}; arm specificity >=
${ECHO_FLOORS.specificityRatio} x base.`;

const argValue = (args: string[], name: string) => { const at = args.indexOf(name); return at >= 0 ? args[at + 1] ?? null : null; };

interface RatingPoint { id: string; body?: { prompt?: unknown }; prompts: Record<string, string> }
interface RatingReply { id: string; arm: string; text: string }

export const historyOf = (prompt: string): string[] => parsePrompt(prompt).body.filter((segment) => segment.role !== 'system').map(turnText);

export function scoreRows(points: readonly RatingPoint[], replies: readonly RatingReply[], base: string, arm: string) {
  const byId = new Map(points.map((point) => [point.id, point]));
  const samples: EchoSample[] = replies.flatMap((reply) => {
    const point = byId.get(reply.id.replace(/-s\d+$/, '')) ?? byId.get(reply.id);
    const prompt = typeof point?.body?.prompt === 'string' ? point.body.prompt : point?.prompts[base];
    if (!point || typeof prompt !== 'string' || (reply.arm !== base && reply.arm !== arm)) return [];
    return [{ arm: reply.arm, echo: echoRate(reply.text, historyOf(prompt)), specificity: specificity(reply.text) }];
  });
  return echoVerdict(samples, base, arm);
}

export async function score(out: string, base: string, arm: string) {
  const points = await readJsonl(join(out, 'points.jsonl')) as RatingPoint[];
  const replies = await readJsonl(join(out, 'replies.jsonl')) as RatingReply[];
  const result = scoreRows(points, replies, base, arm);
  await writeFile(join(out, 'echo.json'), `${JSON.stringify(result, null, 1)}\n`, 'utf-8');
  return result;
}

export async function baseline(files: string[]) {
  const chats = await loudChats(files);
  const samples: EchoSample[] = [];
  let deep = 0;
  for (const list of chats.values()) {
    for (const reply of newReplies(list)) {
      if (reply.before.history.length >= 40) deep += 1;
      samples.push({ arm: 'recorded', echo: echoRate(reply.text, reply.before.history.map(turnText)), specificity: specificity(reply.text) });
    }
  }
  const scored = samples.filter((sample) => sample.echo !== null);
  const verdict = echoVerdict(samples, 'recorded', 'recorded');
  return { chats: chats.size, replies: samples.length, withEchoGrams: scored.length, repliesWith40Back: deep, echo: verdict.echo.recorded, specificity: verdict.specificity.recorded };
}

export async function main(argv: string[]) {
  const [command, ...args] = argv;
  if (command === 'score') {
    const out = argValue(args, '--out');
    if (!out) throw new Error('--out <rating dir> is required');
    return score(out, argValue(args, '--base') ?? 'trim', argValue(args, '--arm') ?? 'compact');
  }
  if (command === 'baseline') {
    const files = (argValue(args, '--payloads') ?? '').split(',').filter(Boolean);
    if (!files.length) throw new Error('--payloads <file.jsonl[,…]> is required');
    return baseline(files);
  }
  console.log(USAGE);
  return null;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).then((result) => { if (result) console.log(JSON.stringify(result, null, 1)); }).catch((error) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
}
