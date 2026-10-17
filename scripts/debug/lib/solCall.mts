import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { opencodeText, refuseFastModel, SOL_MODEL, spawnExec, type Exec, type ModelReply } from './e0LabelRun.mts';

export interface SolAgent { id: string; system: string }

export const solConfig = (agent: string, systemFile: string) => JSON.stringify({
  $schema: 'https://opencode.ai/config.json',
  agent: { [agent]: { mode: 'primary', prompt: `{file:${systemFile.replace(/\\/g, '/')}}`, tools: { '*': false }, permission: { edit: 'deny', bash: 'deny', webfetch: 'deny' } } },
});

export async function askSolAgent(agent: SolAgent, prompt: string, workDir: string, exec: Exec = spawnExec, model = SOL_MODEL): Promise<ModelReply> {
  refuseFastModel(model);
  if (!/^[a-z][a-z0-9-]*$/.test(agent.id)) throw new Error(`agent id must be lower-case words: ${agent.id}`);
  mkdirSync(workDir, { recursive: true });
  const systemFile = join(workDir, `${agent.id}-system.txt`);
  writeFileSync(systemFile, agent.system, 'utf-8');
  const run = await exec('opencode', ['run', '--standalone', '--format', 'json', '--agent', agent.id, '-m', model], prompt, { OPENCODE_CONFIG_CONTENT: solConfig(agent.id, systemFile) }, workDir);
  const text = opencodeText(run.stdout);
  if (run.code !== 0 || !text) throw new Error(`opencode ${model} failed (exit ${run.code}): ${run.stderr.slice(-400)}`);
  return { text, model };
}

export async function withRetry<T>(run: () => Promise<T>, tries = 3, waitMs = 5000): Promise<T> {
  let last: unknown = null;
  for (let attempt = 0; attempt < tries; attempt += 1) {
    try {
      return await run();
    } catch (error) {
      last = error;
      if (attempt < tries - 1) await new Promise((done) => setTimeout(done, waitMs * (attempt + 1)));
    }
  }
  throw last instanceof Error ? last : new Error(String(last));
}

export async function mapLimit<T, R>(items: readonly T[], limit: number, run: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const index = next;
      next += 1;
      out[index] = await run(items[index], index);
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, worker));
  return out;
}

export function parseJsonObject(text: string): Record<string, unknown> | null {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    const value = JSON.parse(text.slice(start, end + 1));
    return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
  } catch {
    return null;
  }
}
