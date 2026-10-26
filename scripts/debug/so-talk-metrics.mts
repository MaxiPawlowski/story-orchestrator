import { readFileSync } from 'node:fs';
import { parseChatJsonl, talkMetrics } from './lib/talkMetrics.mts';

const USAGE = 'node scripts/debug/so-talk-metrics.mts --player <name> --lead <name> --cast <a,b,c> <chat.jsonl> [more.jsonl]';

const args = process.argv.slice(2);
const flag = (name: string) => {
  const at = args.indexOf(`--${name}`);
  return at >= 0 ? args.splice(at, 2)[1] : undefined;
};
const player = flag('player');
const lead = flag('lead');
const cast = (flag('cast') ?? '').split(',').map((name) => name.trim()).filter(Boolean);
if (!player || !lead || !args.length) {
  console.error(USAGE);
  process.exit(2);
}
const rows = args.map((path) => ({ path, ...talkMetrics({ rows: parseChatJsonl(readFileSync(path, 'utf8')), player, lead, cast: [...new Set([lead, ...cast])] }) }));
console.log(JSON.stringify({
  chats: rows,
  openingHookRate: rows.filter((row) => row.openingHook).length / rows.length,
  yieldIntegrity: rows.reduce((sum, row) => sum + row.yieldedAfterQuestion, 0) / Math.max(1, rows.reduce((sum, row) => sum + row.playerQuestions, 0)),
}, null, 2));
