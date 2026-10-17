import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { criticRecordsIn, tallyCriticQuotes, type CriticRecord } from './lib/criticQuotes.mts';

const usage = 'node scripts/debug/so-critic-quotes.mts <chat.jsonl|record.json>... [--out <file>]';

const args = process.argv.slice(2);
const outAt = args.indexOf('--out');
const out = outAt >= 0 ? args[outAt + 1] : null;
const files = args.filter((arg, index) => arg !== '--out' && index !== outAt + 1);
if (!files.length) {
  console.error(usage);
  process.exit(2);
}

const firstJson = (text: string): unknown => {
  try {
    return JSON.parse(text);
  } catch {
    return JSON.parse(text.split('\n')[0] ?? 'null');
  }
};

const seen = new Set<string>();
const records: CriticRecord[] = [];
for (const file of files) {
  for (const record of criticRecordsIn(firstJson(fs.readFileSync(file, 'utf8')))) {
    const key = createHash('sha256').update(JSON.stringify([record.beats, record.verdicts])).digest('hex');
    if (seen.has(key)) continue;
    seen.add(key);
    records.push(record);
  }
}
const result = { measuredAt: new Date().toISOString(), files: files.length, records: records.length, ...tallyCriticQuotes(records) };
const text = `${JSON.stringify(result, null, 2)}\n`;
if (out) fs.writeFileSync(out, text);
process.stdout.write(text);
