import { existsSync } from 'node:fs';
import { readFile, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

export const TAIL_FILES = { journal: 'journal.jsonl', payloads: 'payloads.jsonl', console: 'console.jsonl' } as const;
export type TailName = keyof typeof TAIL_FILES;
export const TAIL_NAMES = Object.keys(TAIL_FILES) as TailName[];
export const READY_TIMEOUT_MS = 90_000;
export const DRAIN_TIMEOUT_MS = 90_000;

export const ackPaths = (out: string) => ({ ready: `${out}.ready`, drain: `${out}.drain`, drained: `${out}.drained` });

export async function writeAck(path: string, body: Record<string, unknown>) {
  await writeFile(path, JSON.stringify({ at: new Date().toISOString(), pid: process.pid, ...body }), 'utf-8');
}

export async function readAck(path: string): Promise<Record<string, any> | null> {
  if (!existsSync(path)) return null;
  try { return JSON.parse(await readFile(path, 'utf-8')); } catch { return null; }
}

export function drainGate(requested: () => boolean): () => boolean {
  let seen = false;
  return () => {
    if (!requested()) return false;
    if (seen) return true;
    seen = true;
    return false;
  };
}

export const drainRequested = (out: string) => () => existsSync(ackPaths(out).drain);

export async function clearAcks(out: string) {
  const paths = ackPaths(out);
  await Promise.all([paths.ready, paths.drain, paths.drained].map((path) => rm(path, { force: true })));
}

export async function waitFor<T>(read: () => Promise<T | null>, timeoutMs: number, intervalMs = 500, sleep = (ms: number) => new Promise((done) => setTimeout(done, ms))): Promise<T | null> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const value = await read();
    if (value) return value;
    if (Date.now() >= deadline) return null;
    await sleep(intervalMs);
  }
}

export interface TailAcks { ready: Record<string, any> | null; drained: Record<string, any> | null }

export async function readTailAcks(dir: string, names: readonly TailName[] = TAIL_NAMES): Promise<Record<TailName, TailAcks>> {
  const out = {} as Record<TailName, TailAcks>;
  for (const name of names) {
    const paths = ackPaths(resolve(dir, TAIL_FILES[name]));
    out[name] = { ready: await readAck(paths.ready), drained: await readAck(paths.drained) };
  }
  return out;
}

export function tailProblems(acks: Partial<Record<TailName, TailAcks>>, phase: 'start' | 'stop'): string[] {
  const problems: string[] = [];
  for (const name of TAIL_NAMES) {
    const ack = acks[name];
    if (!ack?.ready) problems.push(`the ${name} tail never acknowledged that it was capturing (${TAIL_FILES[name]}.ready)`);
    if (phase === 'stop') {
      if (!ack?.drained) problems.push(`the ${name} tail never acknowledged its final drain (${TAIL_FILES[name]}.drained): the end of the capture may be lost`);
      else if (ack.drained.ok === false) problems.push(`the ${name} tail drained with a gap: ${JSON.stringify(ack.drained)}`);
    }
  }
  return problems;
}
