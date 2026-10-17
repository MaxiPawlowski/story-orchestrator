import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

export const CAPTURE_GLOBAL = '__soReplyCapture';
export const HELPERS_GLOBAL = '__soRc';
export const DEFAULT_GROUP = 'Group: Arin, DM Narrator';
export const DEFAULT_RECEIVER = 'Arin';
export const DEFAULT_NARRATOR = 'DM Narrator';
export const REAL_REPLY_TIMEOUT_MS = 600_000;
export const PLUMBING_REPLY_TIMEOUT_MS = 20_000;
const UNSAFE = /["|{}\\\r\n]/;

export type Step = Record<string, unknown>;
export interface Line { speaker: 'player' | 'narrator' | 'receiver'; text: string }
export interface Cast { group: string; receiver: string; narrator: string }
export interface Capture { requests: string[]; reply: string; replyName: string | null; error: string | null; blocks: Record<string, string>; plumbing: boolean }

export const sha256 = (text: string) => createHash('sha256').update(text).digest('hex');
export const canonicalHash = (value: unknown) => sha256(JSON.stringify(value));
export const writeJson = async (file: string, value: unknown) => writeFile(file, `${JSON.stringify(value, null, 1)}\n`, 'utf-8');
export const readJson = async <T = unknown,>(file: string): Promise<T> => JSON.parse(await readFile(file, 'utf-8')) as T;

export function castOf(options: Partial<Cast> = {}): Cast {
  const cast = { group: options.group ?? DEFAULT_GROUP, receiver: options.receiver ?? DEFAULT_RECEIVER, narrator: options.narrator ?? DEFAULT_NARRATOR };
  for (const [key, value] of Object.entries(cast)) if (!value || UNSAFE.test(value)) throw new Error(`cast ${key} ${JSON.stringify(value)} is empty or holds a character a slash command cannot carry`);
  return cast;
}

export const fill = (text: string, cast: Cast) => text.replaceAll('{receiver}', cast.receiver).replaceAll('{narrator}', cast.narrator);

export function unsafeText(text: string): string | null {
  if (!text.trim()) return 'empty';
  return UNSAFE.test(text) ? `holds one of " | { } \\ or a newline: ${JSON.stringify(text.slice(0, 80))}` : null;
}

export function lineStep(line: Line, cast: Cast): Step {
  const text = fill(line.text, cast);
  const problem = unsafeText(text);
  if (problem) throw new Error(`transcript line ${problem}`);
  if (line.speaker === 'player') return { send: text };
  return { slash: `/sendas name="${line.speaker === 'receiver' ? cast.receiver : cast.narrator}" raw=false ${text}` };
}

export function clearStep(debug: Record<string, string> = {}): Step {
  const pins = Object.entries(debug).map(([key, value]) => `globalThis[${JSON.stringify(key)}] = ${JSON.stringify(value)};`).join(' ');
  return {
    eval: `for (const key of Object.keys(globalThis).filter((k) => k.startsWith('storyOrchestratorDebug'))) delete globalThis[key]; ${pins} delete globalThis.${CAPTURE_GLOBAL}; const ctx = SillyTavern.getContext(); for (let id = ctx.chat.length - 1; id >= 0; id -= 1) await ctx.deleteMessage(id, undefined, false); if (ctx.chat.length !== 0) throw new Error('the sandbox chat still holds ' + ctx.chat.length + ' message(s)'); return { cleared: true, pinned: ${JSON.stringify(Object.keys(debug))} };`,
  };
}

export function helpersStep(): Step {
  return {
    eval: `const rt = globalThis.storyOrchestratorRuntime; const NL = String.fromCharCode(10); const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms)); const until = async (test, ms, what) => { const end = Date.now() + ms; for (;;) { const value = await test(); if (value) return value; if (Date.now() > end) throw new Error('timed out after ' + ms + ' ms: ' + what); await pause(250); } }; const chid = (name) => SillyTavern.getContext().characters.findIndex((character) => character.name === name); const line = (name) => { rt.onMemberDrafted(chid(name)); return String(rt.getAppliedEpistemicBlock() ?? ''); }; const shown = (el) => Boolean(el) && getComputedStyle(el).display !== 'none'; const busy = () => shown(document.querySelector('#mes_stop')) || document.body.dataset.generating === 'true'; const textOf = (body) => typeof body?.prompt === 'string' ? body.prompt : Array.isArray(body?.messages) ? body.messages.map((m) => (typeof m?.content === 'string' ? m.content : JSON.stringify(m?.content ?? ''))).join(NL) : JSON.stringify(body ?? null); const stub = async (reply) => { const tg = await import('/scripts/textgen-settings.js'); const host = await import('/script.js'); const status = host.online_status; host.setOnlineStatus('SO stub'); const streaming = tg.textgenerationwebui_settings.streaming; tg.textgenerationwebui_settings.streaming = false; const original = globalThis.fetch; globalThis.fetch = async (input, init) => { const url = String(typeof input === 'string' ? input : input?.url ?? ''); if (url.includes('/api/backends/') && url.endsWith('/generate')) return new Response(JSON.stringify({ choices: [{ text: reply, message: { content: reply } }], results: [{ text: reply }], content: reply }), { status: 200, headers: { 'Content-Type': 'application/json' } }); return original(input, init); }; return () => { globalThis.fetch = original; tg.textgenerationwebui_settings.streaming = streaming; host.setOnlineStatus(status); }; }; const generate = async (name, canned, ms) => { const ctx = SillyTavern.getContext(); const requests = []; const listener = (data, dryRun) => { if (!dryRun) requests.push(textOf(data)); }; ctx.eventSource.on(ctx.eventTypes.GENERATE_AFTER_DATA, listener); const restore = canned === null ? null : await stub(canned); const before = ctx.chat.length; let error = null; try { await ctx.generate('normal', { force_chid: chid(name) }); await until(() => SillyTavern.getContext().chat.length > before && !busy(), ms, 'the reply of ' + name); await pause(1500); await until(() => !busy(), ms, 'generation to settle'); } catch (e) { error = String(e?.message ?? e); } finally { ctx.eventSource.removeListener(ctx.eventTypes.GENERATE_AFTER_DATA, listener); if (restore) restore(); } const box = document.querySelector('#send_textarea'); if (box) { box.value = ''; box.dispatchEvent(new Event('input', { bubbles: true })); } const last = SillyTavern.getContext().chat.at(-1); const replied = SillyTavern.getContext().chat.length > before && last && !last.is_user; return { requests, reply: replied ? String(last.mes ?? '') : '', replyName: replied ? String(last.name ?? '') : null, error }; }; const saved = async () => { for (let i = 0; i < 100 && rt.getSnapshot().saveHealth?.pendingBoundary != null; i += 1) await pause(100); }; globalThis.${HELPERS_GLOBAL} = { rt, pause, until, chid, line, busy, generate, saved }; if (rt.turnBlocksHeld?.()) rt.clearPrivateInjection?.(); return { ready: true, mainApi: SillyTavern.getContext().mainApi };`,
  };
}

export function generateStep(member: string, canned: string | null, blocks: Record<string, string>, extra: Record<string, unknown> = {}): Step {
  const reads = Object.entries(blocks).map(([key, expr]) => `${JSON.stringify(key)}: String(${expr} ?? '')`).join(', ');
  const ms = canned === null ? REAL_REPLY_TIMEOUT_MS : PLUMBING_REPLY_TIMEOUT_MS;
  return {
    log: 400,
    eval: `const h = globalThis.${HELPERS_GLOBAL}; const blocks = { ${reads} }; const out = await h.generate(${JSON.stringify(member)}, ${JSON.stringify(canned)}, ${ms}); await h.saved(); globalThis.${CAPTURE_GLOBAL} = { ...out, blocks, plumbing: ${canned !== null}, extra: ${JSON.stringify(extra)} }; if (out.error) throw new Error('generation failed: ' + out.error); if (!out.requests.length) throw new Error('no drafted request was seen'); return { requests: out.requests.length, replyLength: out.reply.length, replyName: out.replyName };`,
  };
}

export const memberBlock = (name: string) => `globalThis.${HELPERS_GLOBAL}.line(${JSON.stringify(name)})`;
export const extensionBlock = (key: string) => `SillyTavern.getContext().extensionPrompts[${JSON.stringify(key)}]?.value`;

export function scenarioDoc(note: string, plumbing: boolean, cast: Cast, steps: Step[], why: string): Record<string, unknown> {
  return {
    _note: note,
    requires: { lane: plumbing ? 'no-model' : 'model', group: cast.group, members: [cast.receiver, cast.narrator], judge: 'off', why },
    steps,
  };
}

export type ScenarioRunner = (file: string, group: string) => Promise<{ ok: boolean; error?: string; notRunnable?: boolean; capture: unknown }>;

export function pageScenarioRunner(page: any): ScenarioRunner {
  return async (file, group) => {
    const { runScenario } = await import('../so-scenario.mts');
    await page.evaluate((name) => { delete (globalThis as any)[name]; }, CAPTURE_GLOBAL);
    const result = await runScenario(page, file, { sandbox: true, group }) as { ok: boolean; error?: string; notRunnable?: boolean; steps?: Array<{ ok: boolean; error?: string }> };
    const capture = await page.evaluate((name) => { const value = (globalThis as any)[name] ?? null; delete (globalThis as any)[name]; return value; }, CAPTURE_GLOBAL);
    const failed = result.steps?.find((step) => !step.ok);
    return { ok: result.ok, error: result.error ?? failed?.error, notRunnable: result.notRunnable, capture };
  };
}

export interface RecordJob { key: string; doc: Record<string, unknown>; meta: Record<string, unknown> }

export async function recordJobs(jobs: RecordJob[], out: string, group: string, run: ScenarioRunner, log: (line: string) => void = console.log) {
  const scenarios = join(out, 'scenarios');
  const records = join(out, 'records');
  await mkdir(scenarios, { recursive: true });
  await mkdir(records, { recursive: true });
  const done: string[] = [];
  const failed: Array<{ key: string; error: string }> = [];
  let skipped = 0;
  for (const job of jobs) {
    const target = join(records, `${job.key}.json`);
    if (existsSync(target)) { skipped += 1; continue; }
    const file = join(scenarios, `${job.key}.json`);
    await writeJson(file, job.doc);
    const result = await run(file, group);
    if (result.notRunnable) throw new Error(`${job.key}: not runnable: ${result.error ?? 'requires unmet'}`);
    const capture = result.capture as Capture | null;
    if (!result.ok || !capture) {
      failed.push({ key: job.key, error: result.error ?? 'no capture' });
      log(`${job.key}: FAILED ${result.error ?? 'no capture'}`);
      continue;
    }
    await writeJson(target, { key: job.key, at: new Date().toISOString(), ...job.meta, scenarioSha256: canonicalHash(job.doc), capture });
    done.push(job.key);
    log(`${job.key}: recorded (${capture.reply.length} chars${capture.plumbing ? ', plumbing' : ''})`);
  }
  return { jobs: jobs.length, recorded: done.length, skipped, failed };
}

export const lastRequest = (capture: Pick<Capture, 'requests'>) => capture.requests.at(-1) ?? '';
