import type { Page } from 'playwright';
import type { ReadRoute, RecordedCall } from './promptBatch.mts';

export type ItemKind = 'witness' | 'fixture';

export interface PageItem { kind: ItemKind; spec: unknown; canned: string }

export interface PageItemResult {
  ok: boolean;
  error?: string;
  result: Record<string, unknown> | null;
  calls: RecordedCall[];
  refused: Array<{ url: string; body: string | null }>;
  tokenizer: Array<{ url: string; status: number }>;
}

type Evaluator = Pick<Page, 'evaluate'>;

export async function installRecorder(page: Evaluator): Promise<{ installed: boolean }> {
  return page.evaluate(() => {
    const g = globalThis as any;
    const state = g.__soPromptBatch ??= { armed: false, calls: [], refused: [], tokenizer: [], canned: '' };
    if (state.wrapped) return { installed: true };
    const MODEL = /\/api\/(?:backends\/[a-z-]+\/generate|novelai\/generate|horde\/generate|plugins\/story-orchestrator-[a-z-]+\/(?!status))/;
    const TEXT = /\/api\/backends\/text-completions\/generate/;
    const TOKENIZER = /\/api\/tokenizers\//;
    const original = g.fetch;
    g.fetch = async function promptBatchFetch(input: any, init?: any) {
      const url = String(typeof input === 'string' ? input : input?.url ?? '');
      const live = g.__soPromptBatch;
      if (live.armed && MODEL.test(url)) {
        const body = typeof init?.body === 'string' ? init.body : null;
        if (TEXT.test(url) && body !== null) {
          live.calls.push({ url, body });
          return new Response(live.canned, { status: 200, headers: { 'Content-Type': 'application/json' } });
        }
        live.refused.push({ url, body: body === null ? null : body.slice(0, 300) });
        throw new Error(`prompt-batch: refused model call ${url}`);
      }
      if (live.armed && TOKENIZER.test(url)) {
        const response = await original.call(this, input, init);
        live.tokenizer.push({ url, status: response.status });
        return response;
      }
      return original.call(this, input, init);
    };
    state.wrapped = true;
    return { installed: true };
  });
}

export async function runPageItem(page: Evaluator, item: PageItem): Promise<PageItemResult> {
  return page.evaluate(async (payload: PageItem) => {
    const g = globalThis as any;
    const state = g.__soPromptBatch;
    if (!state?.wrapped) throw new Error('prompt-batch recorder is not installed');
    const suite = g.storyOrchestratorLiveSuite;
    if (!suite) throw new Error('storyOrchestratorLiveSuite not registered (extension not loaded?)');
    state.calls = [];
    state.refused = [];
    state.tokenizer = [];
    state.canned = payload.canned;
    state.armed = true;
    const done = (ok: boolean, result: Record<string, unknown> | null, error?: string) => ({ ok, ...(error ? { error } : {}), result, calls: [...state.calls], refused: [...state.refused], tokenizer: [...state.tokenizer] });
    try {
      if (payload.kind === 'witness') {
        const read = await suite.runWitnessRead(payload.spec);
        return done(true, { prompt: read.prompt, rawResponse: read.rawResponse, status: read.witness?.status ?? null, scope: read.scope, rejected: read.rejected, calls: read.calls, inputTokens: read.inputTokens, window: read.window });
      }
      const live = await suite.runFixture(payload.spec, {});
      return done(true, { prompt: live.prompt, rawResponse: live.rawResponse, deltas: live.deltas, facts: live.facts, rejected: live.rejected, memory: live.memory, arcs: live.arcs, epistemic: live.epistemic, ledger: live.ledger });
    } catch (error) {
      return done(false, null, error instanceof Error ? error.message : String(error));
    } finally {
      state.armed = false;
      state.canned = '';
    }
  }, item) as Promise<PageItemResult>;
}

export async function readRoute(page: Evaluator): Promise<ReadRoute & { stUrl: string; bundleSha256: string | null }> {
  return page.evaluate(async () => {
    const g = globalThis as any;
    const suite = g.storyOrchestratorLiveSuite;
    if (!suite) throw new Error('storyOrchestratorLiveSuite not registered (extension not loaded?)');
    const reading = await suite.measureBudget('', 'read');
    const ctx = g.SillyTavern.getContext();
    const profiles = Array.isArray(ctx.extensionSettings?.connectionManager?.profiles) ? ctx.extensionSettings.connectionManager.profiles : [];
    const profile = profiles.find((entry: any) => entry?.id === reading.profileId) ?? null;
    const preset = profile?.instruct ? ctx.getPresetManager?.('instruct')?.getCompletionPresetByName(profile.instruct) : null;
    const pick = (key: string) => (typeof preset?.[key] === 'string' ? preset[key] : undefined);
    let bundleSha256: string | null = null;
    try {
      const response = await fetch('/scripts/extensions/third-party/story-orchestrator/dist/index.js', { cache: 'no-store' });
      if (response.ok) bundleSha256 = [...new Uint8Array(await crypto.subtle.digest('SHA-256', await response.arrayBuffer()))].map((byte) => byte.toString(16).padStart(2, '0')).join('');
    } catch {
      bundleSha256 = null;
    }
    return {
      stUrl: location.origin,
      bundleSha256,
      profileId: reading.profileId ?? null,
      name: profile?.name ?? null,
      api: profile?.api ?? null,
      apiUrl: profile?.['api-url'] ?? null,
      preset: profile?.preset ?? null,
      instructName: profile?.instruct ?? null,
      instruct: preset ? { stop_sequence: pick('stop_sequence'), input_sequence: pick('input_sequence'), output_sequence: pick('output_sequence'), last_output_sequence: pick('last_output_sequence') } : null,
    };
  }) as Promise<ReadRoute & { stUrl: string; bundleSha256: string | null }>;
}
