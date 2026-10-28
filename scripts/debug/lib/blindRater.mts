import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { askClaude, type ModelReply } from './e0LabelRun.mts';
import { seededRandom } from './ratingPack.mts';
import { readJson, sha256, writeJson } from './replyCapture.mts';

export type Asker = (prompt: string, workDir: string) => Promise<ModelReply>;
export interface BlindEntry<P, S> { source: string; payload: P; secret: S }
export interface BlindPack<P> { format: string; seed: string; items: Array<{ id: string } & P> }
export interface BlindKey<S> { format: string; seed: string; items: Record<string, { source: string } & S> }

export function buildBlind<P extends object, S extends object>(format: string, entries: Array<BlindEntry<P, S>>, seed: string): { pack: BlindPack<P>; key: BlindKey<S> } {
  const random = seededRandom(`${format}:${seed}`);
  const ordered = [...entries].sort((left, right) => left.source.localeCompare(right.source)).map((entry) => ({ entry, order: random() })).sort((left, right) => left.order - right.order);
  const items: BlindPack<P>['items'] = [];
  const key: BlindKey<S>['items'] = {};
  for (const { entry } of ordered) {
    const id = `it-${sha256(`${seed}\u0000${entry.source}`).slice(0, 12)}`;
    items.push({ id, ...entry.payload });
    key[id] = { source: entry.source, ...entry.secret };
  }
  return { pack: { format: `${format}-pack`, seed, items }, key: { format: `${format}-key`, seed, items: key } };
}

export function packLeaks(pack: BlindPack<object>, secretWords: string[]): string[] {
  const text = JSON.stringify(pack.items);
  return secretWords.filter((word) => word && text.includes(word)).map((word) => `the pack names ${JSON.stringify(word)}`);
}

export function jsonObject(text: string): Record<string, unknown> | null {
  for (let start = text.indexOf('{'); start >= 0; start = text.indexOf('{', start + 1)) {
    let depth = 0;
    let quoted = false;
    for (let at = start; at < text.length; at += 1) {
      const char = text[at];
      if (quoted) {
        if (char === '\\') at += 1;
        else if (char === '"') quoted = false;
      } else if (char === '"') quoted = true;
      else if (char === '{') depth += 1;
      else if (char === '}' && (depth -= 1) === 0) {
        try {
          const value = JSON.parse(text.slice(start, at + 1));
          if (value && typeof value === 'object' && !Array.isArray(value)) return value;
        } catch {
          break;
        }
        break;
      }
    }
  }
  return null;
}

export const raterWorkDir = () => mkdtemp(join(tmpdir(), 'so-rater-'));

export interface RateOptions<I extends { id: string }, L> {
  items: I[];
  dir: string;
  prompt: (item: I) => string;
  parse: (raw: Record<string, unknown> | null) => L | null;
  ask?: Asker;
  plumbing?: (item: I) => L;
  width?: number;
  log?: (line: string) => void;
}

export async function rateItems<I extends { id: string }, L>(options: RateOptions<I, L>) {
  const { items, dir, prompt, parse, ask = askClaude, plumbing, width = 3, log = console.log } = options;
  await mkdir(dir, { recursive: true });
  const work = plumbing ? null : await raterWorkDir();
  let asked = 0;
  let failed = 0;
  const queue = items.filter((item) => !existsSync(join(dir, `${item.id}.json`)));
  const worker = async () => {
    for (let item = queue.shift(); item; item = queue.shift()) {
      const text = prompt(item);
      if (plumbing) {
        await writeJson(join(dir, `${item.id}.json`), { id: item.id, rater: 'plumbing', model: null, promptSha256: sha256(text), label: plumbing(item), raw: null });
        asked += 1;
        continue;
      }
      try {
        const reply = await ask(text, work as string);
        await writeJson(join(dir, `${item.id}.json`), { id: item.id, rater: 'second-model', model: reply.model, promptSha256: sha256(text), label: parse(jsonObject(reply.text)), raw: reply.text });
        asked += 1;
        log(`${item.id}: labelled`);
      } catch (error) {
        failed += 1;
        log(`${item.id}: rater failed: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  };
  try {
    await Promise.all(Array.from({ length: Math.max(1, width) }, worker));
  } finally {
    if (work) await rm(work, { recursive: true, force: true });
  }
  return { items: items.length, asked, failed, skipped: items.length - queue.length - asked - failed };
}

export interface StoredLabel<L> { id: string; rater: string; model: string | null; label: L | null }

export async function readLabels<L>(dir: string): Promise<Map<string, StoredLabel<L>>> {
  const out = new Map<string, StoredLabel<L>>();
  if (!existsSync(dir)) return out;
  for (const name of (await readdir(dir)).filter((entry) => entry.endsWith('.json')).sort()) {
    const value = await readJson<StoredLabel<L>>(join(dir, name));
    out.set(value.id, value);
  }
  return out;
}

export const ratio = (hit: number, of: number) => (of > 0 ? hit / of : null);
