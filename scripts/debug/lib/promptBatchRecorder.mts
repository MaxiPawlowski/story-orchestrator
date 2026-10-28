import type { Page } from 'playwright';
import type { ReadRoute, RecordedCall } from './promptBatch.mts';

export type ItemKind = 'witness' | 'fixture' | 'scenario';

export interface RecorderRule { id: string; source: string; flags?: string; replies: string[]; freeze?: boolean }

export interface RecorderPlan { rules: RecorderRule[]; canned: string; probe?: string }

export interface RuledCall extends RecordedCall { rule: string | null }

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
    const state = g.__soPromptBatch ??= { armed: false, calls: [], refused: [], tokenizer: [], canned: '', rules: [], used: {} };
    if (state.wrapped) return { installed: true };
    const MODEL = /\/api\/(?:backends\/[a-z-]+\/generate|novelai\/generate|horde\/generate|plugins\/story-orchestrator-(?!lore\/)[a-z-]+\/(?!status))/;
    const TEXT = /\/api\/backends\/text-completions\/generate/;
    const TOKENIZER = /\/api\/tokenizers\//;
    const original = g.fetch;
    g.fetch = async function promptBatchFetch(input: any, init?: any) {
      const url = String(typeof input === 'string' ? input : input?.url ?? '');
      const live = g.__soPromptBatch;
      if (live.armed && MODEL.test(url)) {
        const body = typeof init?.body === 'string' ? init.body : null;
        if (TEXT.test(url) && body !== null) {
          const prompt = (() => { try { const parsed = JSON.parse(body); return typeof parsed.prompt === 'string' ? parsed.prompt : JSON.stringify(parsed.messages ?? ''); } catch { return ''; } })();
          const rule = (live.rules ?? []).find((entry: any) => new RegExp(entry.source, entry.flags ?? '').test(prompt)) ?? null;
          live.calls.push({ url, body, rule: rule ? rule.id : null });
          if (rule?.freeze) {
            try { live.frozen = new Function(live.plan?.probe ?? 'return null')(); } catch (error: any) { live.frozen = { probeError: String(error?.message ?? error) }; }
          }
          const used = rule ? (live.used[rule.id] = (live.used[rule.id] ?? 0) + 1) - 1 : 0;
          const reply = rule ? rule.replies[Math.min(used, rule.replies.length - 1)] : live.canned;
          return new Response(reply, { status: 200, headers: { 'Content-Type': 'application/json' } });
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
    state.rules = [];
    state.used = {};
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

export const ARM_EVAL = "const s = globalThis.__soPromptBatch; if (!s?.wrapped || !s.plan) throw new Error('prompt-batch recorder is not installed or has no plan'); s.calls = []; s.refused = []; s.tokenizer = []; s.used = {}; s.frozen = null; s.rules = s.plan.rules; s.canned = s.plan.canned; s.armed = true; return { armed: true };";

export const DISARM_EVAL = "const s = globalThis.__soPromptBatch; if (s) s.armed = false; return { disarmed: true, calls: s?.calls?.length ?? 0 };";

export async function setRecorderPlan(page: Evaluator, plan: RecorderPlan): Promise<void> {
  await page.evaluate((value: RecorderPlan) => {
    const state = (globalThis as any).__soPromptBatch;
    if (!state?.wrapped) throw new Error('prompt-batch recorder is not installed');
    Object.assign(state, { plan: value, armed: false, calls: [], refused: [], tokenizer: [], used: {}, context: null, frozen: null });
  }, plan);
}

export interface RecorderState { calls: RuledCall[]; refused: Array<{ url: string; body: string | null }>; tokenizer: Array<{ url: string; status: number }>; context: unknown }

export async function drainRecorder(page: Evaluator): Promise<RecorderState> {
  return page.evaluate(() => {
    const state = (globalThis as any).__soPromptBatch;
    if (!state) return { calls: [], refused: [], tokenizer: [], context: null };
    const out = { calls: [...state.calls], refused: [...state.refused], tokenizer: [...state.tokenizer], context: state.context ?? null };
    Object.assign(state, { armed: false, plan: null, rules: [], context: null, frozen: null });
    return out;
  }) as Promise<RecorderState>;
}

export async function servedBundleSha(page: Evaluator): Promise<string | null> {
  return page.evaluate(async () => {
    try {
      const response = await fetch('/scripts/extensions/third-party/story-orchestrator/dist/index.js', { cache: 'no-store' });
      if (!response.ok) return null;
      return [...new Uint8Array(await crypto.subtle.digest('SHA-256', await response.arrayBuffer()))].map((byte) => byte.toString(16).padStart(2, '0')).join('');
    } catch {
      return null;
    }
  }) as Promise<string | null>;
}
