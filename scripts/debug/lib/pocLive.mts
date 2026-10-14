import { execFile } from 'node:child_process';
import { appendFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { freemem } from 'node:os';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { resolve } from 'node:path';
import type { Page, Route } from 'playwright';
import { classifyCall, type Mode, type Provider, type Sample, parseSmi } from './pocDrivers.mts';
import { DRY_REPLIES, FakeMedia, harnessCompleteFake, harnessStatusFake } from './pocFakes.mts';
import { installLiveHeadProbe, readLiveHeadSamples, resetLiveHeadSamples } from './liveHeadProbe.mts';
import { waitForIdle } from '../st-actions.mts';

export const BLOCKED_PORTS = new Set([8188, 18888, 18080, 18898, 18899, 8139]);
export const VISION_MODEL = 'openai/gpt-6.1-sol';

export interface DryRoutes { fake: FakeMedia; blocked: string[]; replies: number; stop(): Promise<void> }

const CONTENT_TYPES: Record<string, string> = { js: 'application/javascript', mjs: 'application/javascript', json: 'application/json', css: 'text/css', map: 'application/json', wasm: 'application/wasm' };
const DIST = '/third-party/story-orchestrator/dist/';

async function candidateFile(route: Route, distDir: string, path: string) {
  const name = path.slice(path.indexOf(DIST) + DIST.length);
  if (!/^[a-zA-Z0-9_./-]+$/.test(name) || name.includes('..')) return route.fulfill({ status: 404, body: '' });
  const file = resolve(distDir, name);
  if (!existsSync(file)) return route.fulfill({ status: 404, body: '' });
  return route.fulfill({ status: 200, contentType: CONTENT_TYPES[name.split('.').pop() ?? ''] ?? 'application/octet-stream', body: await readFile(file) });
}

export async function installCandidateRoute(page: Page, distDir: string) {
  const handler = (route: Route) => candidateFile(route, distDir, new URL(route.request().url()).pathname);
  await page.route(`**${DIST}**`, handler);
  return { stop: async () => { await page.unroute(`**${DIST}**`, handler).catch(() => undefined); } };
}

export const DRY_THOUGHT = 'The keepers take in the soaked visitor.<channel|>';

export async function startStreamServer(chunkMs = 45): Promise<{ url: string; served: () => number; close: () => Promise<void> }> {
  let served = 0;
  const server = createServer((request, response) => {
    request.resume();
    request.on('end', async () => {
      const text = `${DRY_THOUGHT}${DRY_REPLIES[served++ % DRY_REPLIES.length]}`;
      response.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Access-Control-Allow-Origin': '*' });
      const words = text.match(/\S+\s*/g) ?? [text];
      for (const word of words) {
        response.write(`data: ${JSON.stringify({ choices: [{ text: word, index: 0, finish_reason: null }] })}\n\n`);
        await new Promise((done) => setTimeout(done, chunkMs));
      }
      response.end(`data: ${JSON.stringify({ choices: [{ text: '', index: 0, finish_reason: 'stop' }] })}\n\ndata: [DONE]\n\n`);
    });
  });
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
  const port = (server.address() as AddressInfo).port;
  return { url: `http://127.0.0.1:${port}/stream`, served: () => served, close: () => new Promise((done) => server.close(() => done())) };
}

export async function installDryRoutes(page: Page, owned: (character: string) => boolean, distDir: string | null = null): Promise<DryRoutes> {
  const fake = new FakeMedia(owned);
  const stream = await startStreamServer();
  const state = { blocked: [] as string[], replies: 0 };
  const json = (route: Route, status: number, body: unknown) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
  const handler = async (route: Route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (BLOCKED_PORTS.has(Number(url.port))) { state.blocked.push(request.url()); return route.abort('blockedbyclient'); }
    const path = url.pathname;
    if (distDir && path.includes(DIST)) return candidateFile(route, distDir, path);
    const body = (() => { try { return request.postData() ? JSON.parse(request.postData() as string) : {}; } catch { return {}; } })();
    if (path.startsWith('/api/plugins/story-orchestrator-media/')) {
      const reply = fake.handle(request.method(), path.slice('/api/plugins/story-orchestrator-media'.length), body);
      return reply.body ? route.fulfill({ status: reply.status, contentType: reply.contentType, body: reply.body }) : json(route, reply.status, reply.json);
    }
    if (path.startsWith('/api/plugins/story-orchestrator-gpu/') || path.startsWith('/api/plugins/story-orchestrator-judge/') || path.startsWith('/api/sd/')) return json(route, 404, { error: 'dry run: not installed' });
    if (path === '/api/plugins/story-orchestrator-harness/status') return json(route, 200, harnessStatusFake(VISION_MODEL));
    if (path === '/api/plugins/story-orchestrator-harness/complete') return json(route, 200, harnessCompleteFake(body));
    if (path.startsWith('/api/plugins/story-orchestrator-harness/')) return json(route, 404, { error: 'dry run: harness agent bridge absent' });
    if (path === '/api/backends/text-completions/status') return json(route, 200, { result: 'dry-artemis', data: [{ id: 'dry-artemis' }] });
    if (path === '/api/backends/text-completions/generate') {
      const text = `${DRY_THOUGHT}${DRY_REPLIES[state.replies++ % DRY_REPLIES.length]}`;
      if (body.stream) return route.continue({ url: stream.url });
      return json(route, 200, { choices: [{ text, index: 0, finish_reason: 'stop' }], content: text });
    }
    if (path === '/api/backends/chat-completions/generate') {
      const text = 'neutral';
      if (body.stream) return route.fulfill({ status: 200, contentType: 'text/event-stream', body: `data: ${JSON.stringify({ choices: [{ delta: { content: text } }] })}\n\ndata: [DONE]\n\n` });
      return json(route, 200, { choices: [{ message: { role: 'assistant', content: text }, finish_reason: 'stop' }] });
    }
    if (path.startsWith('/characters/')) {
      const file = fake.file(decodeURI(path));
      if (file) return route.fulfill({ status: 200, contentType: file.contentType, body: file.body });
      return route.fallback();
    }
    if (path === '/api/sprites/get') {
      const name = url.searchParams.get('name') ?? '';
      if (name.includes('/') && owned(name.split('/')[0])) return json(route, 200, fake.spriteListing(name));
    }
    return route.fallback();
  };
  await page.route('**/*', handler);
  return { fake, get blocked() { return state.blocked; }, get replies() { return state.replies + stream.served(); },
    stop: async () => { await page.unroute('**/*', handler).catch(() => undefined); await stream.close(); } } as DryRoutes;
}

export interface CallRow { at: string; step: string; provider: Provider | null; url: string }

export function attachCallRecorder(page: Page, step: () => string, file: string) {
  const rows: CallRow[] = [];
  const listener = (request: { url(): string; postData(): string | null }) => {
    const provider = classifyCall(request.url(), request.postData());
    if (!provider) return;
    const row = { at: new Date().toISOString(), step: step(), provider, url: new URL(request.url()).pathname };
    rows.push(row);
    void appendFile(file, `${JSON.stringify(row)}\n`).catch(() => undefined);
  };
  page.on('request', listener);
  return { rows, stop: () => page.off('request', listener) };
}

const smi = (): Promise<{ usedMiB: number; util: number } | null> => new Promise((done) => {
  execFile('nvidia-smi', ['--query-gpu=memory.used,utilization.gpu', '--format=csv,noheader,nounits'], { timeout: 4000 }, (error, stdout) => done(error ? null : parseSmi(String(stdout).split(/\r?\n/)[0] ?? '')));
});

export async function sampleNow(mode: Mode): Promise<Sample> {
  const ramFreeMiB = Math.round(freemem() / 1048576);
  if (mode === 'dry') return { at: new Date().toISOString(), gpuUsedMiB: null, gpuUtil: null, ramFreeMiB, stub: true };
  const reading = await smi();
  return { at: new Date().toISOString(), gpuUsedMiB: reading?.usedMiB ?? null, gpuUtil: reading?.util ?? null, ramFreeMiB };
}

export function startSampler(mode: Mode, file: string, intervalMs = 5000) {
  const samples: Sample[] = [];
  let busy = false;
  const tick = async () => {
    if (busy) return;
    busy = true;
    try { const row = await sampleNow(mode); samples.push(row); await appendFile(file, `${JSON.stringify(row)}\n`); } finally { busy = false; }
  };
  void tick();
  const timer = setInterval(() => void tick(), intervalMs);
  return { samples, tick, stop: () => clearInterval(timer) };
}

export async function forceMotion(page: Page) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'no-preference' }] });
  const before = await page.evaluate(() => {
    const ctx = (globalThis as any).SillyTavern.getContext();
    const was = Boolean(ctx.powerUserSettings.reduced_motion);
    ctx.powerUserSettings.reduced_motion = false;
    (globalThis as any).storyOrchestratorSprites?.notify?.();
    return was;
  });
  return { reducedBefore: before, detach: () => cdp.detach().catch(() => undefined) };
}

export async function installProbes(page: Page) {
  await page.evaluate(installLiveHeadProbe).catch(() => undefined);
  await page.evaluate(() => {
    const root = globalThis as any;
    if (root.__pocTurns) return true;
    const ctx = root.SillyTavern.getContext(), types = ctx.eventTypes;
    const state = root.__pocTurns = { events: [] as Array<{ kind: string; at: number; id?: unknown; type?: unknown }>, speaking: new Set<string>(), talker: new Set<string>(), activity: new Set<string>(), visemes: new Set<string>() };
    setInterval(() => {
      const stage = root.storyOrchestratorSprites, view = stage?.view?.();
      if (!view) return;
      if (view.speaking) state.speaking.add(String(view.speaking));
      if (view.talker) state.talker.add(String(view.talker));
      const active = stage.activity?.view?.();
      if (active) state.activity.add(String(active));
      const headed = active && (view.actors ?? []).some((actor: any) => actor.name === active && actor.liveHead);
      const mouth = headed ? stage.activity?.mouth?.(active) : null;
      if (mouth) state.visemes.add(JSON.stringify(mouth, (_key, value) => typeof value === 'number' ? Math.round(value * 100) / 100 : value));
    }, 50);
    const on = (key: string, kind: string) => { if (types[key]) ctx.eventSource.on(types[key], (id: unknown, type: unknown) => state.events.push({ kind, at: Date.now(), id, type })); };
    on('MESSAGE_SENT', 'sent'); on('CHARACTER_MESSAGE_RENDERED', 'rendered'); on('GENERATION_ENDED', 'ended'); on('STREAM_TOKEN_RECEIVED', 'token'); on('GENERATION_STARTED', 'started');
    return true;
  });
}

export interface TurnResult {
  line: string; ms: number | null; firstTokenMs: number | null; replies: number; replied: boolean; speakers: string[]; tokens: number; mouths: number; mouthValues: number[]; uploads: number;
  liveHeads: number; ready: number; reducedMotion: boolean | null; framing: string | null; seen?: { speaking: string[]; talker: string[]; activity: string[] }; visemes: number; error?: string;
}

export async function playTurn(page: Page, line: string, { timeoutMs = 600000 } = {}): Promise<TurnResult> {
  await waitForIdle(page, timeoutMs);
  const startLength = await page.evaluate(() => {
    const root = globalThis as any;
    root.__pocTurns.events = [];
    root.__pocTurns.speaking = new Set(); root.__pocTurns.talker = new Set(); root.__pocTurns.activity = new Set(); root.__pocTurns.visemes = new Set();
    return root.SillyTavern.getContext().chat.length;
  });
  await page.evaluate(resetLiveHeadSamples).catch(() => undefined);
  const textarea = page.locator('#send_textarea');
  await textarea.fill(line);
  await textarea.dispatchEvent('input');
  await page.locator('#send_but').waitFor({ state: 'visible', timeout: timeoutMs });
  await page.locator('#send_but').click({ force: true });
  let error: string | undefined;
  try { await page.waitForFunction((length) => (globalThis as any).SillyTavern.getContext().chat.length > length, startLength, { timeout: 60000 }); await waitForIdle(page, timeoutMs); }
  catch (reason) { error = reason instanceof Error ? reason.message : String(reason); }
  const samples = await page.evaluate(readLiveHeadSamples).catch(() => ({ mouths: [], uploads: 0 }));
  const read = await page.evaluate((length) => {
    const root = globalThis as any, events = root.__pocTurns.events as Array<{ kind: string; at: number }>;
    const chat = root.SillyTavern.getContext().chat.slice(length);
    const sent = events.find((event) => event.kind === 'sent')?.at ?? null;
    const rendered = events.filter((event) => event.kind === 'rendered').map((event) => event.at);
    const token = events.find((event) => event.kind === 'token')?.at ?? null;
    const replies = chat.filter((message: any) => !message.is_user && !message.is_system && String(message.mes ?? '').trim());
    const view = root.storyOrchestratorSprites?.view?.();
    return { sent, last: rendered.length ? Math.max(...rendered) : null, token, replies: replies.length, speakers: replies.map((message: any) => String(message.name)),
      tokens: events.filter((event) => event.kind === 'token').length, liveHeads: (view?.actors ?? []).filter((actor: any) => actor.liveHead).length,
      ready: document.querySelectorAll('[data-live-head-ready="true"]').length, reducedMotion: view?.reducedMotion ?? null, framing: view?.framing ?? null,
      seen: { speaking: [...root.__pocTurns.speaking], talker: [...root.__pocTurns.talker], activity: [...root.__pocTurns.activity] }, visemes: root.__pocTurns.visemes.size };
  }, startLength);
  return { line, ms: read.sent && read.last ? read.last - read.sent : null, firstTokenMs: read.sent && read.token ? read.token - read.sent : null, replies: read.replies,
    replied: read.replies > 0, speakers: read.speakers, tokens: read.tokens, mouths: (samples.mouths ?? []).length, mouthValues: (samples.mouths ?? []).slice(0, 6), uploads: samples.uploads ?? 0,
    liveHeads: read.liveHeads, ready: read.ready, reducedMotion: read.reducedMotion, framing: read.framing, seen: read.seen, visemes: read.visemes, ...(error ? { error } : {}) };
}

export async function stageView(page: Page) {
  return page.evaluate(() => {
    const root = globalThis as any, view = root.storyOrchestratorSprites?.view?.();
    if (!view) return { visible: false, framing: null, actors: [] as any[] };
    return { visible: Boolean(view.visible), framing: view.framing ?? null, actors: (view.actors ?? []).map((actor: any) => ({ name: actor.name, avatar: actor.avatar, label: actor.label,
      path: actor.path, set: actor.set, pose: actor.pose ?? null, liveHead: actor.liveHead ? { member: actor.liveHead.member, look: actor.liveHead.look, artHash: actor.liveHead.artHash } : null })) };
  });
}

export async function readStaleState(page: Page, isOwned: (name: string) => boolean) {
  const raw = await page.evaluate(async () => {
    const root = globalThis as any, ctx = root.SillyTavern.getContext(), headers = ctx.getRequestHeaders();
    const sprites = root.storyOrchestratorRuntime.getGlobalSettings().sprites ?? {};
    const inventory = await fetch('/api/plugins/story-orchestrator-media/sprites/inventory', { headers }).then((r: Response) => r.ok ? r.json() : { trusted: false, rows: [] }).catch(() => ({ trusted: false, rows: [] }));
    const view = root.storyOrchestratorSprites?.view?.() ?? { actors: [] };
    const roster = root.storyOrchestratorRuntime.getStory?.()?.roster ?? [];
    return { sprites: { visualSources: sprites.visualSources ?? {}, liveHeadRigs: sprites.liveHeadRigs ?? {} }, inventory, roster: roster.map((member: any) => ({ id: member.id, name: member.name })),
      actors: (view.actors ?? []).map((actor: any) => ({ name: actor.name, set: actor.set, path: actor.path, pose: actor.pose ?? null, liveHead: actor.liveHead ? { look: actor.liveHead.look, artHash: actor.liveHead.artHash, member: actor.liveHead.member } : null })) };
  });
  const characters = [...new Set((raw.inventory.rows ?? []).map((row: any) => row.character).filter(isOwned))] as string[];
  const manifests = await page.evaluate(async (characters: string[]) => {
    const headers = (globalThis as any).SillyTavern.getContext().getRequestHeaders();
    const out: Record<string, any[]> = {};
    for (const character of characters) out[character] = await fetch('/api/plugins/story-orchestrator-media/sprites/list', { method: 'POST', headers, body: JSON.stringify({ character }) }).then((r: Response) => r.ok ? r.json() : []).catch(() => []);
    return out;
  }, characters);
  const served = await page.evaluate(async (paths: string[]) => {
    const out: Record<string, boolean> = {};
    for (const path of paths) out[path] = await fetch(path, { method: 'GET', cache: 'no-store' }).then((r: Response) => r.ok).catch(() => false);
    return out;
  }, raw.actors.map((actor: any) => actor.path).filter((path: unknown): path is string => typeof path === 'string' && path.startsWith('/characters/')));
  return { raw, manifests, served };
}

export async function writeRecord(dir: string, name: string, data: unknown): Promise<string> {
  await mkdir(dir, { recursive: true });
  const path = resolve(dir, name);
  await writeFile(path, `${JSON.stringify(data, null, 2)}\n`);
  return path;
}

export async function waitStage(page: Page, test: (view: Awaited<ReturnType<typeof stageView>>) => boolean, timeoutMs: number, pollMs = 1000) {
  const deadline = Date.now() + timeoutMs;
  let last = await stageView(page);
  while (Date.now() < deadline) {
    if (test(last)) return { ok: true, view: last };
    await page.waitForTimeout(pollMs);
    last = await stageView(page);
  }
  return { ok: test(last), view: last };
}
