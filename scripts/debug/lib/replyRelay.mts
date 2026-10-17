import type { Page, Route } from 'playwright';
import { askSolAgent, withRetry, type SolAgent } from './solCall.mts';

export type RelayMode = 'sol' | 'scripted';

export interface RelayCall {
  index: number;
  at: string;
  api: 'text' | 'chat';
  speaker: string | null;
  promptChars: number;
  ms: number;
  text: string;
  model: string | null;
  error?: string;
}

export interface RelayOptions {
  mode: RelayMode;
  workDir: string;
  script?: (call: { index: number; speaker: string | null; prompt: string }) => string;
  onCall?: (call: RelayCall) => void;
  ask?: (agent: SolAgent, prompt: string, workDir: string) => Promise<{ text: string; model: string | null }>;
  timings?: (call: { index: number; prompt: string; text: string }) => Record<string, number>;
}

export interface Relay {
  calls: RelayCall[];
  refused: () => number;
  stop: () => Promise<void>;
}

export const RELAY_MODEL_ID = 'so-reply-relay';

export const REPLY_AGENT: SolAgent = {
  id: 'so-reply',
  system: [
    'You are the text-generation backend of a roleplay chat app. The user message is the raw prompt the app assembled, usually in a chat template.',
    'Write only the next chat message, spoken by the character the request names, in character and in the voice and length the prompt sets up (about 60 to 220 words).',
    'Output the message text only: no name prefix, no template tokens, no reasoning, no commentary, no quotation of these instructions.',
  ].join(' '),
};

const OPEN_THOUGHT = '<|channel>thought';
const CLOSE_THOUGHT = '<channel|>';

export function opensThought(prompt: string): boolean {
  const open = prompt.lastIndexOf(OPEN_THOUGHT);
  return open >= 0 && prompt.lastIndexOf(CLOSE_THOUGHT) < open;
}

export function promptOf(api: 'text' | 'chat', body: Record<string, unknown>): string {
  if (api === 'text') return String(body.prompt ?? '');
  const messages = Array.isArray(body.messages) ? body.messages as Array<{ role?: unknown; content?: unknown; name?: unknown }> : [];
  return messages.map((message) => `[${String(message.role ?? 'user')}${message.name ? ` ${String(message.name)}` : ''}]\n${typeof message.content === 'string' ? message.content : JSON.stringify(message.content)}`).join('\n\n');
}

export function relayRequest(prompt: string, speaker: string | null): string {
  return `${speaker ? `Write the next message as ${speaker}.` : 'Write the next message.'}\n\n----- RAW PROMPT -----\n${prompt}\n----- END RAW PROMPT -----\n\n${speaker ? `Now write ${speaker}'s next message only.` : 'Now write the next message only.'}`;
}

export function cleanReply(text: string, speaker: string | null): string {
  let out = String(text ?? '').replace(/<\|?\/?(?:turn|channel|start_of_turn|end_of_turn)[^>]*>/g, '').trim();
  const fenced = out.match(/^```[a-z]*\n([\s\S]*?)\n```$/);
  if (fenced) out = fenced[1].trim();
  if (speaker) {
    const prefix = new RegExp(`^\\**${speaker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\**\\s*:\\s*\\**\\s*`, 'i');
    out = out.replace(prefix, '');
  }
  return out.trim();
}

export function textBody(text: string, prompt: string): string {
  return `${opensThought(prompt) ? `Reply drafted by the relay.${CLOSE_THOUGHT}` : ''}${text}`;
}

export function sseText(text: string, timings: Record<string, number> | null = null): string {
  return `data: ${JSON.stringify({ choices: [{ text, index: 0, finish_reason: null }] })}\n\ndata: ${JSON.stringify({ choices: [{ text: '', index: 0, finish_reason: 'stop' }], ...(timings ? { timings } : {}) })}\n\ndata: [DONE]\n\n`;
}

export function sseChat(text: string): string {
  return `data: ${JSON.stringify({ choices: [{ delta: { content: text }, index: 0 }] })}\n\ndata: ${JSON.stringify({ choices: [{ delta: {}, index: 0, finish_reason: 'stop' }] })}\n\ndata: [DONE]\n\n`;
}

const parseBody = (raw: string | null): Record<string, unknown> => {
  try {
    const value = raw ? JSON.parse(raw) : {};
    return value && typeof value === 'object' ? value : {};
  } catch {
    return {};
  }
};

async function speakerOf(page: Page): Promise<string | null> {
  return page.evaluate(() => {
    const ctx = (globalThis as any).SillyTavern?.getContext?.();
    const id = ctx?.characterId;
    const name = id === undefined || id === null ? null : ctx?.characters?.[Number(id)]?.name;
    return typeof name === 'string' && name ? name : null;
  }).catch(() => null);
}

export async function installReplyRelay(page: Page, options: RelayOptions): Promise<Relay> {
  const calls: RelayCall[] = [];
  let refused = 0;
  const ask = options.ask ?? ((agent, prompt, dir) => withRetry(() => askSolAgent(agent, prompt, dir)));
  const json = (route: Route, status: number, body: unknown) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
  const handler = async (route: Route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (path === '/api/backends/text-completions/status') return json(route, 200, { result: RELAY_MODEL_ID, data: [{ id: RELAY_MODEL_ID }] });
    if (path === '/api/backends/chat-completions/status') return json(route, 200, { data: [{ id: RELAY_MODEL_ID }] });
    const api = path === '/api/backends/text-completions/generate' ? 'text' : path === '/api/backends/chat-completions/generate' ? 'chat' : null;
    if (!api) return route.fallback();
    const body = parseBody(request.postData());
    if (body.stream !== true) {
      refused += 1;
      return json(route, 503, { error: { message: 'reply relay: side calls are not served on this lane' } });
    }
    const index = calls.length;
    const prompt = promptOf(api, body);
    const speaker = await speakerOf(page);
    const started = Date.now();
    let text = '';
    let model: string | null = null;
    let error: string | undefined;
    try {
      if (options.mode === 'scripted') {
        if (!options.script) throw new Error('scripted relay needs a script');
        text = options.script({ index, speaker, prompt });
        model = 'scripted';
      } else {
        const reply = await ask(REPLY_AGENT, relayRequest(prompt, speaker), options.workDir);
        text = cleanReply(reply.text, speaker);
        model = reply.model;
      }
    } catch (failure) {
      error = failure instanceof Error ? failure.message : String(failure);
    }
    const call: RelayCall = { index, at: new Date(started).toISOString(), api, speaker, promptChars: prompt.length, ms: Date.now() - started, text, model, ...(error ? { error } : {}) };
    calls.push(call);
    options.onCall?.(call);
    if (error || !text) return json(route, 502, { error: { message: `reply relay failed: ${error ?? 'empty reply'}` } });
    const timings = options.timings ? options.timings({ index, prompt, text }) : null;
    return route.fulfill({ status: 200, contentType: 'text/event-stream', body: api === 'text' ? sseText(textBody(text, prompt), timings) : sseChat(text) });
  };
  await page.route('**/api/backends/**', handler);
  return { calls, refused: () => refused, stop: async () => { await page.unroute('**/api/backends/**', handler).catch(() => undefined); } };
}

export async function connectThroughRelay(page: Page, timeoutMs = 30000): Promise<{ online: string | null; api: string | null }> {
  return page.evaluate(async (limit) => {
    const ctx = (globalThis as any).SillyTavern.getContext();
    const button = document.querySelector(ctx.mainApi === 'openai' ? '#api_button_openai' : '#api_button_textgenerationwebui') as HTMLElement | null;
    button?.click();
    const until = Date.now() + limit;
    while (Date.now() < until) {
      const status = (globalThis as any).SillyTavern.getContext().onlineStatus;
      if (status && status !== 'no_connection') return { online: String(status), api: String(ctx.mainApi) };
      await new Promise((done) => setTimeout(done, 500));
    }
    return { online: (globalThis as any).SillyTavern.getContext().onlineStatus ?? null, api: String(ctx.mainApi) };
  }, timeoutMs);
}
