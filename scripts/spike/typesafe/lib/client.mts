import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { debugDirFor } from '../../../debug/lib/connection.mts';

export const SPIKE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const PROJECT_ROOT = resolve(SPIKE_ROOT, '..', '..', '..');
export const OUT_ROOT = join(debugDirFor(process.env, PROJECT_ROOT), 'typesafe-spike');
export const KEY_FILE = join(homedir(), '.typesafe', 'api-key', '.env');
export const MODEL = process.env.TYPESAFE_DEFAULT_MODEL ?? 'jev-latest';
export const API_URL = `${(process.env.TYPESAFE_BASE_URL ?? 'https://api.typesafe.ai').replace(/\/$/, '')}/v1/systemone`;
export const USD_PER_M_INPUT = 0.042;
export const MAX_CHOICE_OPTIONS = 255;

export interface NoulQuestion { type: 'noul'; instructions: unknown; criteria?: { true?: unknown; false?: unknown } }
export interface ChoiceQuestion { type: 'choice'; instructions: unknown; criteria: Record<string, unknown> }
export interface ScoreQuestion { type: 'score'; instructions: unknown; criteria: unknown[] }
export type Question = NoulQuestion | ChoiceQuestion | ScoreQuestion;

export interface NoulAnswer { type: 'noul'; noul: number }
export interface ChoiceAnswer { type: 'choice'; choice: string; probabilities: Record<string, number>; confidence: number }
export interface ScoreAnswer { type: 'score'; score: number; probabilities: Record<string, number>; confidence: number; legend?: Record<string, string> }
export type Answer = NoulAnswer | ChoiceAnswer | ScoreAnswer;

export interface SystemOneRequest { state: unknown; questions: Record<string, Question> }

export interface CallRecord {
  tag: string;
  answers: Record<string, Answer>;
  usage: { input_tokens: number; output_tokens: number };
  latencyMs: number;
  cached: boolean;
  dry: boolean;
  attempts: number;
  stateChars: number;
  questionCount: number;
  request: SystemOneRequest;
  model: string;
}

interface ClientConfig { dry: boolean; noCache: boolean; concurrency: number }

const config: ClientConfig = { dry: false, noCache: false, concurrency: 4 };
export const ledger: CallRecord[] = [];

export function configureClient(next: Partial<ClientConfig>) {
  Object.assign(config, next);
}

export function isDryRun() {
  return config.dry;
}

let apiKey: string | null = null;

const keyFromDotenv = (): string => {
  if (!existsSync(KEY_FILE)) return '';
  for (const line of readFileSync(KEY_FILE, 'utf-8').split(/\r?\n/)) {
    const match = line.match(/^\s*(?:export\s+)?TYPESAFE_API_KEY\s*=\s*(.*)$/);
    if (match) return match[1].trim().replace(/^(['"])(.*)\1$/, '$2').trim();
  }
  return '';
};

const findKey = () => process.env.TYPESAFE_API_KEY?.trim() || keyFromDotenv();

function loadKey(): string {
  if (apiKey) return apiKey;
  const key = findKey();
  if (!key) throw new Error(`No TypeSafe API key. Put TYPESAFE_API_KEY=... in ${KEY_FILE} or set the TYPESAFE_API_KEY env var. Use --dry-run to exercise the harness without one.`);
  apiKey = key;
  return key;
}

export function hasKey(): boolean {
  return Boolean(findKey());
}

export function validateRequest(request: SystemOneRequest): string[] {
  const issues: string[] = [];
  const entries = Object.entries(request.questions);
  if (!entries.length) issues.push('questions is empty');
  if (request.state === undefined || request.state === '') issues.push('state is empty');
  for (const [id, question] of entries) {
    if (!question.instructions) issues.push(`${id}: missing instructions`);
    if (question.type === 'choice') {
      const count = Object.keys(question.criteria ?? {}).length;
      if (count < 2) issues.push(`${id}: choice needs at least 2 options (has ${count})`);
      if (count > MAX_CHOICE_OPTIONS) issues.push(`${id}: choice has ${count} options, max ${MAX_CHOICE_OPTIONS}`);
    } else if (question.type === 'score') {
      const count = question.criteria?.length ?? 0;
      if (count < 2 || count > 10) issues.push(`${id}: score needs 2-10 levels (has ${count})`);
    } else if (question.type === 'noul') {
      const extra = Object.keys(question.criteria ?? {}).filter((key) => key !== 'true' && key !== 'false');
      if (extra.length) issues.push(`${id}: noul criteria only takes true/false (got ${extra.join(', ')})`);
    } else {
      issues.push(`${id}: unknown type`);
    }
  }
  const chars = JSON.stringify(request).length;
  if (chars > 140_000) issues.push(`request is ${chars} chars, over the ~32k-token state budget`);
  return issues;
}

const sleep = (ms: number) => new Promise((done) => setTimeout(done, ms));

let active = 0;
const waiters: Array<() => void> = [];

async function withSlot<T>(fn: () => Promise<T>): Promise<T> {
  while (active >= config.concurrency) await new Promise<void>((done) => waiters.push(done));
  active += 1;
  try {
    return await fn();
  } finally {
    active -= 1;
    waiters.shift()?.();
  }
}

function synthesize(questions: Record<string, Question>): Record<string, Answer> {
  return Object.fromEntries(Object.entries(questions).map(([id, question]) => {
    if (question.type === 'noul') return [id, { type: 'noul', noul: 0.5 }];
    if (question.type === 'choice') {
      const keys = Object.keys(question.criteria);
      return [id, { type: 'choice', choice: keys[0], confidence: 0, probabilities: Object.fromEntries(keys.map((key) => [key, 1 / keys.length])) }];
    }
    const levels = question.criteria.length;
    return [id, { type: 'score', score: (levels - 1) / 2, confidence: 0, probabilities: Object.fromEntries(question.criteria.map((_, index) => [String(index), 1 / levels])) }];
  }));
}

export interface CallOptions { tag: string; salt?: string; noCache?: boolean }

export async function systemOne(request: SystemOneRequest, options: CallOptions): Promise<CallRecord> {
  const issues = validateRequest(request);
  if (issues.length) throw new Error(`[${options.tag}] invalid request: ${issues.join('; ')}`);
  const body = { state: request.state, model: MODEL, questions: request.questions };
  const text = JSON.stringify(body);
  const stateChars = JSON.stringify(request.state).length;
  const questionCount = Object.keys(request.questions).length;
  const hash = createHash('sha256').update(`${text}|${options.salt ?? ''}`).digest('hex').slice(0, 32);
  const cacheFile = join(OUT_ROOT, config.dry ? 'dry-cache' : 'cache', `${hash}.json`);
  const useCache = !config.noCache && !options.noCache;

  if (useCache && existsSync(cacheFile)) {
    const cached = JSON.parse(await readFile(cacheFile, 'utf-8'));
    const record: CallRecord = { tag: options.tag, answers: cached.response.answers, usage: cached.response.usage, latencyMs: cached.latencyMs, cached: true, dry: config.dry, attempts: cached.attempts, stateChars, questionCount, model: cached.response.model, request };
    ledger.push(record);
    return record;
  }

  if (config.dry) {
    const response = { model: MODEL, answers: synthesize(request.questions), usage: { input_tokens: Math.round(text.length / 4), output_tokens: 0 } };
    await mkdir(dirname(cacheFile), { recursive: true });
    await writeFile(cacheFile, JSON.stringify({ body, response, latencyMs: 0, attempts: 0 }, null, 1));
    const record: CallRecord = { tag: options.tag, answers: response.answers, usage: response.usage, latencyMs: 0, cached: false, dry: true, attempts: 0, stateChars, questionCount, model: MODEL, request };
    ledger.push(record);
    return record;
  }

  const key = loadKey();
  return withSlot(async () => {
    let attempts = 0;
    let lastError = '';
    while (attempts < 6) {
      attempts += 1;
      const started = performance.now();
      let status = 0;
      let payload = '';
      try {
        const response = await fetch(API_URL, {
          method: 'POST',
          headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
          body: text,
          signal: AbortSignal.timeout(30_000),
        });
        status = response.status;
        payload = await response.text();
      } catch (error) {
        lastError = `network: ${error instanceof Error ? error.message : String(error)}`;
        await sleep(500 * 2 ** (attempts - 1));
        continue;
      }
      const latencyMs = performance.now() - started;
      if (status === 200) {
        const parsed = JSON.parse(payload);
        await mkdir(dirname(cacheFile), { recursive: true });
        await writeFile(cacheFile, JSON.stringify({ body, response: parsed, latencyMs, attempts, at: new Date().toISOString() }, null, 1));
        const record: CallRecord = { tag: options.tag, answers: parsed.answers, usage: parsed.usage, latencyMs, cached: false, dry: false, attempts, stateChars, questionCount, model: parsed.model, request };
        ledger.push(record);
        return record;
      }
      if (status === 401 || status === 403) throw new Error(`TypeSafe rejected the API key (HTTP ${status}). Check ${KEY_FILE}.`);
      if (status === 422 || status === 400) throw new Error(`[${options.tag}] TypeSafe rejected the request (HTTP ${status}): ${payload.slice(0, 800)}`);
      lastError = `HTTP ${status}: ${payload.slice(0, 200)}`;
      await sleep(500 * 2 ** (attempts - 1));
    }
    throw new Error(`[${options.tag}] gave up after ${attempts} attempts: ${lastError}`);
  });
}

export const noulOf = (record: CallRecord, id: string): number => {
  const answer = record.answers[id];
  if (!answer || answer.type !== 'noul') throw new Error(`[${record.tag}] missing noul answer ${id}`);
  return answer.noul;
};

export const choiceOf = (record: CallRecord, id: string): ChoiceAnswer => {
  const answer = record.answers[id];
  if (!answer || answer.type !== 'choice') throw new Error(`[${record.tag}] missing choice answer ${id}`);
  return answer;
};

export const scoreOf = (record: CallRecord, id: string): ScoreAnswer => {
  const answer = record.answers[id];
  if (!answer || answer.type !== 'score') throw new Error(`[${record.tag}] missing score answer ${id}`);
  return answer;
};
