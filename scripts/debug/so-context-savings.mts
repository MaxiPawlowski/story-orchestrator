import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loudChats, turnText, type LoudPrompt } from './lib/payloadChats.mts';

const USAGE = `Usage: node scripts/debug/so-context-savings.mts --payloads <a.jsonl[,b.jsonl]> [--tokenizer <llama-tokenize.exe>] [--model <gguf>] [--estimate]

v3.0 43 C item 1: tokens each context saving removes (or moves) per drafted loud request, measured offline on recorded
payloads with the census method: per item, every distinct matched text is tokenised once with the real Gemma vocab
(llama-tokenize, CPU only, --no-bos) to get a chars/token ratio; item tokens = chars / ratio. --estimate uses chars/4.
Counts only; never prints chat text.
  dedupe   agency clauses repeated between guidance and pacing (shipped, no switch)
  sheet    unset narrator-sheet rows, and the header when every row is unset (shipped, no switch)
  recap    recap blocks while the chat is untrimmed (memory.recapOutsideWindow; upper bound: rows of the first four messages stay)
  fixed    static instruction sentences after the prefix boundary (offline arm only, GPU row M43-C2)`;

export const DEFAULT_TOKENIZER = 'C:/dev/tools/llama-b11888-cuda12.4/llama-tokenize.exe';
export const DEFAULT_MODEL = 'C:/dev/models/hf/hub/models--TheDrummer--Artemis-31B-v1.1-GGUF/snapshots/65d0086759d0d45f728b610f48651d4a98d89ed4/Artemis-31B-v1m-Q4_K_M.gguf';

export const SHARED_CLAUSES = [
  'Stay in the present moment and place: never skip ahead in time or move {{user}} and their party somewhere new unless {{user}} chose to go.',
  'End on something that just happened or a character\'s move, not on scenery or mood, and never on a question asking {{user}} what they do.',
  'Never decide how {{user}} feels, what {{user}} believes or what {{user}} concludes: characters may guess at it, never settle it.',
];

export const FIXED_SENTENCES = [
  'Author\'s private direction for this scene, for steering only.',
  'Never quote, paraphrase, summarise or mention anything in this note, and never write notes, brackets or stage directions into a reply.',
  'It says where the scene is heading, not what has happened: nothing in it is true until the chat shows it.',
  'Bring it in as pressure from the world and the characters, one beat at a time, and never reveal what comes later or how the scene ends before it does.',
  'A step in it that skips ahead in time or moves the party somewhere new waits until {{user}} chooses it.',
  'Do not narrate {{user}}\'s own words or decisions.',
  'If nothing new is happening, hand the scene back to {{user}} in one short beat; never fill it with weather, silence or atmosphere.',
  'These characters speak and act for themselves on their own turns; never write their words or choices:',
  'Voice anyone else the scene needs, and when the story already names someone who fits, use them rather than inventing a stranger.',
  ...SHARED_CLAUSES,
];

export const SHEET_HEADER = 'What the player\'s sheet shows right now. Keep the story consistent with it and never mention the sheet:';
export const RECAP_LABELS = ['[Details from this session]', '[Recent events]', '[Earlier scenes]'];

const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
export const sentencePattern = (sentence: string) => new RegExp(escape(sentence).split(escape('{{user}}')).join('.{1,40}?'), 'g');

export interface ItemHits { texts: string[]; perPrompt: number[] }

export function dedupeHits(prompt: string): string[] {
  return SHARED_CLAUSES.flatMap((clause) => {
    const found = prompt.match(sentencePattern(clause)) ?? [];
    return found.slice(1);
  });
}

export function sheetHits(prompt: string): string[] {
  const at = prompt.indexOf(SHEET_HEADER);
  if (at < 0) return [];
  const rows: string[] = [];
  for (const line of prompt.slice(at + SHEET_HEADER.length).split('\n').slice(1)) {
    if (!line.startsWith('- ')) break;
    rows.push(line);
  }
  const empty = rows.filter((row) => /:\s*—\s*$/.test(row));
  return empty.length && empty.length === rows.length ? [SHEET_HEADER, ...empty] : empty;
}

export function blockAfter(prompt: string, label: string): string {
  const at = prompt.indexOf(label);
  if (at < 0) return '';
  const lines: string[] = [label];
  for (const line of prompt.slice(at + label.length).split('\n').slice(1)) {
    if (!line.trim() || line.startsWith('[') || line.startsWith('<|turn>') || line.includes('<turn|>')) break;
    lines.push(line);
  }
  return lines.length > 1 ? lines.join('\n') : '';
}

export function recapHits(prompt: LoudPrompt, untrimmed: boolean): string[] {
  return untrimmed ? RECAP_LABELS.map((label) => blockAfter(prompt.prompt, label)).filter(Boolean) : [];
}

export function fixedHits(prompt: string): string[] {
  const tailStart = prompt.indexOf('<|turn>', prompt.indexOf('<turn|>'));
  const tail = tailStart < 0 ? '' : prompt.slice(tailStart);
  return FIXED_SENTENCES.flatMap((sentence) => tail.match(sentencePattern(sentence)) ?? []);
}

export function untrimmedSet(list: readonly LoudPrompt[]): Set<LoudPrompt> {
  const first = list.find((prompt) => prompt.history.length)?.history[0];
  const opener = first ? turnText(first) : null;
  return new Set(list.filter((prompt) => opener !== null && prompt.history.some((segment) => turnText(segment) === opener)));
}

export function realRatio(texts: readonly string[], tokenizer: string, model: string): number | null {
  const sample = [...new Set(texts)].join('\n').slice(0, 120_000);
  if (!sample) return null;
  const dir = mkdtempSync(join(tmpdir(), 'so-savings-'));
  try {
    const file = join(dir, 'sample.txt');
    writeFileSync(file, sample, 'utf-8');
    const out = execFileSync(tokenizer, ['-m', model, '-f', file, '--no-bos', '--ids', '--log-disable'], { env: { ...process.env, CUDA_VISIBLE_DEVICES: '-1' }, encoding: 'utf-8', maxBuffer: 64 * 1024 * 1024 });
    const ids = out.slice(out.lastIndexOf('[')).match(/\d+/g) ?? [];
    return ids.length ? sample.length / ids.length : null;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const summary = (perPrompt: number[]) => {
  const touched = perPrompt.filter((value) => value > 0);
  const total = perPrompt.reduce((sum, value) => sum + value, 0);
  return {
    prompts: perPrompt.length, touched: touched.length, total: Math.round(total),
    meanPerPrompt: perPrompt.length ? Math.round((total / perPrompt.length) * 10) / 10 : 0,
    meanWhenTouched: touched.length ? Math.round((total / touched.length) * 10) / 10 : 0,
    max: Math.round(Math.max(0, ...perPrompt)),
  };
};

export async function measure(files: string[], options: { tokenizer: string; model: string; estimate: boolean }) {
  const chats = await loudChats(files);
  const items: Record<string, { hits: string[][] }> = { dedupe: { hits: [] }, sheet: { hits: [] }, recap: { hits: [] }, fixed: { hits: [] } };
  for (const list of chats.values()) {
    const untrimmed = untrimmedSet(list);
    for (const prompt of list) {
      items.dedupe.hits.push(dedupeHits(prompt.prompt));
      items.sheet.hits.push(sheetHits(prompt.prompt));
      items.recap.hits.push(recapHits(prompt, untrimmed.has(prompt)));
      items.fixed.hits.push(fixedHits(prompt.prompt));
    }
  }
  const real = !options.estimate && existsSync(options.tokenizer) && existsSync(options.model);
  const result: Record<string, unknown> = { chats: chats.size, prompts: items.dedupe.hits.length, tokenizer: real ? 'gemma-vocab llama-tokenize (CPU)' : 'chars/4 estimate' };
  for (const [name, item] of Object.entries(items)) {
    const texts = item.hits.flat();
    const ratio = real ? realRatio(texts, options.tokenizer, options.model) ?? 4 : 4;
    result[name] = { charsPerToken: Math.round(ratio * 100) / 100, ...summary(item.hits.map((hits) => hits.reduce((sum, text) => sum + text.length, 0) / ratio)) };
  }
  return result;
}

const argValue = (args: string[], name: string) => { const at = args.indexOf(name); return at >= 0 ? args[at + 1] ?? null : null; };

export async function main(argv: string[]) {
  const files = (argValue(argv, '--payloads') ?? '').split(',').filter(Boolean);
  if (!files.length) {
    console.log(USAGE);
    return null;
  }
  return measure(files, { tokenizer: argValue(argv, '--tokenizer') ?? DEFAULT_TOKENIZER, model: argValue(argv, '--model') ?? DEFAULT_MODEL, estimate: argv.includes('--estimate') });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).then((result) => { if (result) console.log(JSON.stringify(result, null, 1)); }).catch((error) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
}
