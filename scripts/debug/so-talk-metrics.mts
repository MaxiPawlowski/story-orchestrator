import { readFileSync } from 'node:fs';
import { parseChatJsonl, parseSpeechLedger, speechLedgerMetrics, talkMetrics } from './lib/talkMetrics.mts';

const USAGE = 'node scripts/debug/so-talk-metrics.mts --player <name> --lead <name> --cast <a,b,c> [--budget <voices>] [--lead-words <n>] <chat.jsonl> [more.jsonl]';

const args = process.argv.slice(2);
const flag = (name: string) => {
  const at = args.indexOf(`--${name}`);
  return at >= 0 ? args.splice(at, 2)[1] : undefined;
};
const player = flag('player');
const lead = flag('lead');
const budget = flag('budget');
const leadWords = flag('lead-words');
const cast = (flag('cast') ?? '').split(',').map((name) => name.trim()).filter(Boolean);
if (!player || !lead || !args.length) {
  console.error(USAGE);
  process.exit(2);
}
const rows = args.map((path) => {
  const text = readFileSync(path, 'utf8');
  return {
    path,
    ...talkMetrics({
      rows: parseChatJsonl(text), player, lead, cast: [...new Set([lead, ...cast])],
      ...(budget ? { budget: Number(budget) } : {}), ...(leadWords ? { leadWords: Number(leadWords) } : {}),
    }),
    speech: speechLedgerMetrics(parseSpeechLedger(text)),
  };
});
console.log(JSON.stringify({
  chats: rows,
  openingHookRate: rows.filter((row) => row.openingHook).length / rows.length,
  yieldIntegrity: rows.reduce((sum, row) => sum + row.yieldedAfterQuestion, 0) / Math.max(1, rows.reduce((sum, row) => sum + row.playerQuestions, 0)),
  budgetCompliance: budget ? rows.reduce((sum, row) => sum + (row.budget?.compliant ?? 0), 0) / Math.max(1, rows.reduce((sum, row) => sum + (row.budget?.rounds ?? 0), 0)) : null,
  leadWithinTarget: leadWords ? rows.reduce((sum, row) => sum + (row.leadLength?.within ?? 0), 0) / Math.max(1, rows.reduce((sum, row) => sum + (row.leadLength?.lines ?? 0), 0)) : null,
}, null, 2));
