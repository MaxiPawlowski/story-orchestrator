import { clampText } from '../utils/story-state';
import { chat, generateQuietPrompt } from "@services/SillyTavernAPI";

export type ArbiterReason = 'win' | 'fail' | 'interval';

export interface CheckpointEvalRequest {
  cpName: string;
  objective?: string;
  latestText: string;
  reason: ArbiterReason;
  matched?: string;
  turn: number;
  intervalTurns: number;
}

export type EvaluationOutcome = 'win' | 'fail' | 'continue';

export interface ModelEval {
  completed: boolean;
  failed: boolean;
  reason?: string;
  confidence?: number;
}

export interface CheckpointEvalPayload {
  request: CheckpointEvalRequest;
  raw: string;
  parsed: ModelEval | null;
  outcome: EvaluationOutcome;
}

export interface CheckpointArbiterApi {
  evaluate: (request: CheckpointEvalRequest) => Promise<CheckpointEvalPayload>;
  clear: () => void;
}




export interface CheckpointArbiterServiceOptions {
  onEvaluated?: (payload: CheckpointEvalPayload) => void;
  snapshotLimit?: number;
  responseLength?: number;
}

interface PendingJob {
  request: CheckpointEvalRequest;
  resolve: (payload: CheckpointEvalPayload) => void;
}

const DEFAULT_SNAPSHOT_LIMIT = 10;
const DEFAULT_RESPONSE_LENGTH = 256;

function snapshot(limit: number): string {
  return (Array.isArray(chat) ? chat.slice(-limit) : [])
    .map((msg, idx) => {
      const text = (msg?.mes || msg?.text || msg?.message || msg?.data?.text || msg?.data?.mes || "") as string;
      if (typeof text !== 'string' || !text.trim()) return null;
      const who = (msg?.name || msg?.character || (msg?.is_user ? 'Player' : 'Companion')) as string;
      return `${idx + 1}. ${clampText(String(who), 40)}: ${clampText(String(text).trim(), 300)}`;
    })
    .filter(Boolean)
    .reverse()
    .join('\n');
}

function buildReasonLine(r: ArbiterReason, matched: string | undefined, intervalTurns: number) {
  if (r === 'interval') return `Periodic check (every ${intervalTurns} turns).`;
  const suffix = matched ? `: ${matched}` : '';
  return r === 'win' ? `Completion trigger matched${suffix}.` : `Failure trigger matched${suffix}.`;
}

function buildEvalPrompt(request: CheckpointEvalRequest, transcript: string) {
  const { cpName, objective, reason, matched, turn, latestText, intervalTurns } = request;
  return [
    'You are an impartial story overseer.',
    `Checkpoint: ${cpName}`,
    objective ? `Objective: ${objective}` : '',
    buildReasonLine(reason, matched, intervalTurns),
    `Player turn: ${turn}`,
    '',
    'Conversation excerpt (most recent first is fine):',
    transcript || 'No recent messages.',
    '',
    'Latest player message:',
    clampText(latestText, 240),
    '',
    'Respond ONLY with JSON. Example:',
    '{"completed": true, "failed": false, "reason": "...", "confidence": 0.95}',
  ].filter(Boolean).join('\n');
}

function parseModel(raw: unknown): ModelEval | null {
  let text = typeof raw === 'string' ? raw.trim() : '';
  if (!text) return null;
  if (/^```/m.test(text)) text = text.replace(/```(?:json)?\s*([\s\S]*?)\s*```/gi, '$1').trim();

  const blocks = [...text.matchAll(/\{[\s\S]*?\}/g)].map(m => m[0]);
  const ordered = blocks.sort((a, b) => b.length - a.length);

  const toBool = (value: any): boolean | null => {
    if (typeof value === 'boolean') return value;
    if (typeof value === 'number') return value !== 0;
    if (typeof value === 'string') {
      const v = value.trim().toLowerCase();
      if (v === 'true') return true;
      if (v === 'false') return false;
    }
    return null;
  };

  const tryJson = (input: string): ModelEval | null => {
    try {
      const obj = JSON.parse(input);
      const completed = toBool(obj.completed ?? obj.complete ?? obj.answer);
      const failed = toBool(obj.failed ?? obj.failure ?? obj.lose);
      if (completed === null && failed === null) return null;
      const result: ModelEval = {
        completed: !!completed,
        failed: !!failed,
        reason: typeof obj.reason === 'string' ? clampText(obj.reason, 200) : undefined,
        confidence: typeof obj.confidence === 'number' ? Math.max(0, Math.min(1, obj.confidence)) : undefined,
      };
      if (result.completed) result.failed = false;
      if (result.failed) result.completed = false;
      return result;
    } catch { return null; }
  };

  for (const candidate of [...ordered, text]) {
    const parsed = tryJson(candidate);
    if (parsed) return parsed;
  }

  const boolKey = (key: string) => {
    const m = text.match(new RegExp(`"${key}"\s*:\s*(true|false)`, 'i'));
    return m ? m[1].toLowerCase() === 'true' : null;
  };
  const completed = boolKey('completed');
  const failed = boolKey('failed');
  if (completed !== null || failed !== null) {
    const out: ModelEval = { completed: !!completed, failed: !!failed };
    if (out.completed) out.failed = false; else if (out.failed) out.completed = false;
    return out;
  }
  return null;
}

function resolveOutcome(parsed: ModelEval | null): EvaluationOutcome {
  if (!parsed) return "continue";
  if (parsed.completed) return "win";
  if (parsed.failed) return "fail";
  return "continue";
}

class CheckpointArbiterService implements CheckpointArbiterApi {
  private queue: PendingJob[] = [];
  private busy = false;
  private disposed = false;
  private options?: CheckpointArbiterServiceOptions;

  constructor(options?: CheckpointArbiterServiceOptions) {
    this.updateOptions(options);
  }

  updateOptions(options?: CheckpointArbiterServiceOptions) {
    this.options = options;
  }

  clear(): void {
    this.queue.length = 0;
  }
  evaluate(request: CheckpointEvalRequest): Promise<CheckpointEvalPayload> {
    if (this.disposed) {
      return Promise.reject(new Error("CheckpointArbiterService disposed"));
    }

    return new Promise<CheckpointEvalPayload>((resolve) => {
      this.queue.push({ request, resolve });
      if (!this.busy) {
        queueMicrotask(() => {
          void this.drain();
        });
      }
    });
  }

  private async drain(): Promise<void> {
    if (this.busy || this.disposed) return;
    this.busy = true;
    try {
      while (!this.disposed && this.queue.length) {
        const job = this.queue.shift()!;
        const transcript = snapshot(this.options?.snapshotLimit ?? DEFAULT_SNAPSHOT_LIMIT);
        const prompt = buildEvalPrompt(job.request, transcript);
        console.log('[Story - CheckpointArbiter] prompt', { reason: job.request.reason, cp: job.request.cpName, turn: job.request.turn });

        let raw = '';
        try {
          raw = await generateQuietPrompt({
            quietPrompt: prompt,
            quietName: 'Checkpoint Arbiter',
            skipWIAN: true,
            quietToLoud: false,
            removeReasoning: false,
            trimToSentence: false,
            responseLength: this.options?.responseLength ?? DEFAULT_RESPONSE_LENGTH,
          });
          console.log('[Story - CheckpointArbiter] raw response', { sample: String(raw).slice(0, 200) });
        } catch (err) {
          console.warn('[Story - CheckpointArbiter] request failed', err);
        }

        const parsed = raw ? parseModel(raw) : null;
        if (raw && !parsed) console.warn('[Story - CheckpointArbiter] parse failed', { sample: String(raw).slice(0, 200) });
        const outcome = resolveOutcome(parsed);
        console.log('[Story - CheckpointArbiter] outcome', { outcome, parsed });

        const payload: CheckpointEvalPayload = { request: job.request, raw, parsed, outcome };
        try { job.resolve(payload); } catch (err) { console.warn('[Story - CheckpointArbiter] resolve failed', err); }
        try { this.options?.onEvaluated?.(payload); } catch (err) { console.warn('[Story - CheckpointArbiter] onEvaluated handler failed', err); }
        if (outcome === 'win') { this.queue.length = 0; break; }
      }
    } finally {
      this.busy = false;
      if (!this.disposed && this.queue.length) {
        queueMicrotask(() => {
          void this.drain();
        });
      }
    }
  }
}

export default CheckpointArbiterService;

