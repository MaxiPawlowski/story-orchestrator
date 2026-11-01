import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { calibrate, meetsFloors, parseFactsBlock, parseLedgerBlock, rateReplies, type PlantedPair, type SessionReply } from './lib/contradictionScore.mts';
import { loudChats, newReplies, turnText } from './lib/payloadChats.mts';

const USAGE = `Usage: node scripts/debug/so-contradiction-rate.mts <command> [...]

v3.0 43 C item 2: reply contradiction rate, code only (no model call).
  calibrate [--fixture <pairs.json>]          planted minimal pairs: pair accuracy, recall, false alarm vs the fixture floors
  baseline --payloads <a.jsonl[,b.jsonl]>      recorded loud prompts: each new reply is checked against the ledger and
                                               established facts of the prompt before it, and the replies still in it.
                                               Prints counts only (contradictions per 100 replies, by source, category
                                               and session length); never prints chat text.
A rate is labelled "uncalibrated" when the calibration misses a floor.`;

export const FIXTURE = join(import.meta.dirname, '..', '..', 'test', 'fixtures', 'memory', 'contradiction-pairs.json');

const argValue = (args: string[], name: string) => { const at = args.indexOf(name); return at >= 0 ? args[at + 1] ?? null : null; };

export async function calibration(path = FIXTURE) {
  const fixture = JSON.parse(await readFile(path, 'utf-8')) as { floors: { pairAccuracy: number; recall: number; falseAlarm: number }; pairs: PlantedPair[] };
  const result = calibrate(fixture.pairs);
  return { floors: fixture.floors, passed: meetsFloors(result, fixture.floors), ...result };
}

export async function baseline(files: string[], fixture = FIXTURE) {
  const chats = await loudChats(files);
  const replies: SessionReply[] = [];
  for (const list of chats.values()) {
    for (const reply of newReplies(list)) {
      const earlier = reply.before.history.filter((segment) => segment.role === 'model').map(turnText);
      replies.push({ text: reply.text, position: reply.position, context: { ledger: parseLedgerBlock(reply.before.system), facts: parseFactsBlock(reply.before.system), earlier } });
    }
  }
  const calibrated = await calibration(fixture);
  return { chats: chats.size, calibrated: calibrated.passed, label: calibrated.passed ? 'calibrated' : 'uncalibrated', ...rateReplies(replies) };
}

export async function main(argv: string[]) {
  const [command, ...args] = argv;
  if (command === 'calibrate') return calibration(argValue(args, '--fixture') ?? FIXTURE);
  if (command === 'baseline') {
    const files = (argValue(args, '--payloads') ?? '').split(',').filter(Boolean);
    if (!files.length) throw new Error('--payloads <file.jsonl[,…]> is required');
    return baseline(files, argValue(args, '--fixture') ?? FIXTURE);
  }
  console.log(USAGE);
  return null;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).then((result) => { if (result) console.log(JSON.stringify(result, null, 1)); }).catch((error) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
}
