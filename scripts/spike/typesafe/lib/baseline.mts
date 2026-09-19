import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Browser, Page } from 'playwright';
import { OUT_ROOT } from './client.mts';

export interface BaselineCall {
  tag: string;
  raw: string;
  latencyMs: number;
  cached: boolean;
  promptChars: number;
}

export interface BaselineProfile { id: string; name: string; api: string; model: string }

export const baselineLedger: BaselineCall[] = [];

let enabled = false;
let connection: { browser: Browser; page: Page } | null = null;
let profile: BaselineProfile | null = null;
let queue: Promise<unknown> = Promise.resolve();

export function enableBaseline(on: boolean) {
  enabled = on;
}

export const baselineEnabled = () => enabled;

export const baselineProfile = () => profile;

async function page(): Promise<Page> {
  if (connection) return connection.page;
  const { connectToST } = await import('../../../debug/lib/connection.mts');
  const result = await connectToST({ attach: true });
  if (!result.attached) {
    await result.browser.close().catch(() => {});
    throw new Error('Baseline needs the shared ST browser (node scripts/debug/st-session.mts start). Refusing to launch a separate ST client.');
  }
  connection = { browser: result.browser, page: result.page };
  profile = await result.page.evaluate(() => {
    const context = (globalThis as any).SillyTavern.getContext();
    const runtime = (globalThis as any).storyOrchestratorRuntime;
    const id = runtime?.getExtractionSettings?.().profileId ?? null;
    const profiles = context.extensionSettings?.connectionManager?.profiles ?? [];
    const found = profiles.find((entry: any) => entry.id === id) ?? {};
    return { id: String(id), name: String(found.name ?? ''), api: String(found.api ?? ''), model: String(found.model ?? '') };
  });
  if (!profile?.id || profile.id === 'null') throw new Error('No memory-model profile selected in Story Orchestrator settings; baseline cannot run.');
  return result.page;
}

export async function closeBaseline() {
  if (connection) await connection.browser.close().catch(() => {});
  connection = null;
}

export async function sendViaST(prompt: string, maxTokens: number, tag: string): Promise<BaselineCall> {
  const hash = createHash('sha256').update(`${prompt}|${maxTokens}`).digest('hex').slice(0, 32);
  const cacheFile = join(OUT_ROOT, 'baseline-cache', `${hash}.json`);
  if (existsSync(cacheFile)) {
    const cached = JSON.parse(await readFile(cacheFile, 'utf-8'));
    const call: BaselineCall = { tag, raw: cached.raw, latencyMs: cached.latencyMs, cached: true, promptChars: prompt.length };
    profile ??= cached.profile ?? null;
    baselineLedger.push(call);
    return call;
  }
  if (!enabled) throw new Error('baseline disabled');
  const run = queue.then(async () => {
    const target = await page();
    const result = await target.evaluate(async ({ text, tokens }) => {
      const shared = await import('/scripts/extensions/shared.js' as string);
      const runtime = (globalThis as any).storyOrchestratorRuntime;
      const profileId = runtime.getExtractionSettings().profileId;
      const started = performance.now();
      const response = await shared.ConnectionManagerRequestService.sendRequest(
        profileId,
        [{ role: 'user', content: text }],
        tokens,
        { extractData: true, includePreset: true, includeInstruct: true, stream: false },
        { temperature: 0.1, top_p: 0.9, stream: false },
      );
      const latencyMs = performance.now() - started;
      const raw = typeof response === 'string' ? response : typeof response?.content === 'string' ? response.content : typeof response?.text === 'string' ? response.text : '';
      return { raw, latencyMs };
    }, { text: prompt, tokens: maxTokens });
    await mkdir(join(OUT_ROOT, 'baseline-cache'), { recursive: true });
    await writeFile(cacheFile, JSON.stringify({ prompt, maxTokens, raw: result.raw, latencyMs: result.latencyMs, profile, at: new Date().toISOString() }, null, 1));
    const call: BaselineCall = { tag, raw: result.raw, latencyMs: result.latencyMs, cached: false, promptChars: prompt.length };
    baselineLedger.push(call);
    return call;
  });
  queue = run.catch(() => undefined);
  return run;
}

export async function tryBaseline(prompt: string, maxTokens: number, tag: string): Promise<BaselineCall | null> {
  try {
    return await sendViaST(prompt, maxTokens, tag);
  } catch (error) {
    if (error instanceof Error && error.message === 'baseline disabled') return null;
    throw error;
  }
}
