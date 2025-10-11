import { clampText } from '../utils/story-state';
import { chat, generateQuietPrompt } from "@services/SillyTavernAPI";

export const DEFAULT_ARBITER_PROMPT = 'You are an impartial story overseer.';

export type ArbiterReason = 'win' | 'fail' | 'interval';

export interface CheckpointEvalRequest {
  cpName: string;
  objective?: string;
  latestText: string;
  reason: ArbiterReason;
  matched?: string;
  turn: number;
  intervalTurns: number;
  transitions?: ArbiterTransitionOption[];
}

export type EvaluationOutcome = 'win' | 'fail' | 'continue';

export interface ModelEval {
  completed: boolean;
  failed: boolean;
  reason?: string;
  confidence?: number;
  nextEdgeId?: string | null;
}

export interface CheckpointEvalPayload {
  request: CheckpointEvalRequest;
  raw: string;
  parsed: ModelEval | null;
  outcome: EvaluationOutcome;
  nextEdgeId?: string | null;
}

export interface CheckpointArbiterApi {
  evaluate: (request: CheckpointEvalRequest) => Promise<CheckpointEvalPayload>;
  clear: () => void;
  updateOptions: (options?: CheckpointArbiterServiceOptions) => void;
}

export interface ArbiterTransitionOption {
  id: string;
  outcome: 'win' | 'fail';
  label?: string;
  description?: string;
  targetName?: string;
  targetObjective?: string;
}

export interface CheckpointArbiterServiceOptions {
  onEvaluated?: (payload: CheckpointEvalPayload) => void;
  snapshotLimit?: number;
  responseLength?: number;
  promptTemplate?: string;
}

interface PendingJob {
  request: CheckpointEvalRequest;
  resolve: (payload: CheckpointEvalPayload) => void;
}

const DEFAULT_SNAPSHOT_LIMIT = 10;
const DEFAULT_RESPONSE_LENGTH = 256;
const PROMPT_LENGTH_LIMIT = 1200;

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

function buildReasonLine(reason: ArbiterReason, matched: string | undefined, intervalTurns: number): string {
  if (reason === 'interval') return `Periodic check (every ${intervalTurns} turns).`;
  const suffix = matched ? `: ${matched}` : '';
  return reason === 'win' ? `Completion trigger matched${suffix}.` : `Failure trigger matched${suffix}.`;
}

function formatTransitionOption(option: ArbiterTransitionOption, idx: number): string {
  const pieces: string[] = [];
  const label = option.label ? ` - ${option.label}` : '';
  const target = option.targetName ? ` -> ${option.targetName}` : '';
  const detail = option.description ? ` ${option.description}` : '';
  const outcome = option.outcome === 'win' ? 'success' : 'failure';
  pieces.push(`${idx + 1}. [${option.id}] (${outcome})${target}${label}${detail}`.trim());
  if (option.targetObjective) {
    pieces.push(`   Objective: ${option.targetObjective}`);
  }
  return pieces.join('\n');
}

function buildTransitionsSection(options?: ArbiterTransitionOption[]): string {
  if (!options || !options.length) return '';
  const winOptions = options.filter((opt) => opt.outcome === 'win');
  const failOptions = options.filter((opt) => opt.outcome === 'fail');
  const lines: string[] = [];
  if (winOptions.length) {
    lines.push('If you determine the checkpoint is completed (success), choose one of:');
    winOptions.forEach((opt, idx) => { lines.push(formatTransitionOption(opt, idx)); });
  }
  if (failOptions.length) {
    if (lines.length) lines.push('');
    lines.push('If you determine the checkpoint failed, choose one of:');
    failOptions.forEach((opt, idx) => { lines.push(formatTransitionOption(opt, idx)); });
  }
  if (!lines.length) return '';
  lines.push('If no option fits your decision, respond with "next_edge": null.');
  return lines.join('\n');
}

function buildEvalPrompt(request: CheckpointEvalRequest, transcript: string, promptTemplate?: string) {
  const { cpName, objective, reason, matched, turn, latestText, intervalTurns } = request;
  const transitionSection = buildTransitionsSection(request.transitions);
  const header = typeof promptTemplate === 'string' && promptTemplate.trim()
    ? promptTemplate.replace(/\r/g, '').trim()
    : DEFAULT_ARBITER_PROMPT;
  const headerLines = header.split(/\n/).map((line) => line.trim()).filter((line) => Boolean(line));
  const lines: string[] = [
    ...headerLines,
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
    transitionSection ? 'Transition options:' : '',
    transitionSection,
    'Respond ONLY with JSON. Fields: "completed" (bool), "failed" (bool), optional "reason" (string), optional "confidence" (0-1), and "next_edge" (string id or null).',
    'Pick "next_edge" from the matching outcome list when you conclude success or failure. Use null if no transition applies or if you decide to continue.',
    '',
    'Respond ONLY with JSON. Example:',
    '{"completed": true, "failed": false, "next_edge": "edge-id", "reason": "...", "confidence": 0.95}',
  ];
  return lines.filter(Boolean).join('\n');
}

function parseModel(raw: unknown): ModelEval | null {
  let text = typeof raw === 'string' ? raw.trim() : '';
  if (!text) return null;
  if (/^```/m.test(text)) text = text.replace(/```(?:json)?\s*([\s\S]*?)\s*```/gi, '$1').trim();

  const blocks = [...text.matchAll(/\{[\s\S]*?\}/g)].map((m) => m[0]);
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
      const edgeRaw = obj.next_edge ?? obj.nextEdge ?? obj.next ?? obj.edge;
      const edgeId = typeof edgeRaw === 'string' ? edgeRaw.trim() : null;
      const result: ModelEval = {
        completed: !!completed,
        failed: !!failed,
        reason: typeof obj.reason === 'string' ? clampText(obj.reason, 200) : undefined,
        confidence: typeof obj.confidence === 'number' ? Math.max(0, Math.min(1, obj.confidence)) : undefined,
        nextEdgeId: edgeId || null,
      };
      if (result.completed) result.failed = false;
      if (result.failed) result.completed = false;
      return result;
    } catch {
      return null;
    }
  };

  for (const candidate of [...ordered, text]) {
    const parsed = tryJson(candidate);
    if (parsed) return parsed;
  }

  const boolKey = (key: string) => {
    const match = text.match(new RegExp(`"${key}"\s*:\s*(true|false)`, 'i'));
    return match ? match[1].toLowerCase() === 'true' : null;
  };
  const completed = boolKey('completed');
  const failed = boolKey('failed');
  if (completed !== null || failed !== null) {
    const out: ModelEval = { completed: !!completed, failed: !!failed, nextEdgeId: null };
    if (out.completed) out.failed = false; else if (out.failed) out.completed = false;
    return out;
  }
  return null;
}

function resolveOutcome(parsed: ModelEval | null): EvaluationOutcome {
  if (!parsed) return 'continue';
  if (parsed.completed) return 'win';
  if (parsed.failed) return 'fail';
  return 'continue';
}

class CheckpointArbiterService implements CheckpointArbiterApi {
  private queue: PendingJob[] = [];
  private busy = false;
  private disposed = false;
  private options: CheckpointArbiterServiceOptions = {
    promptTemplate: DEFAULT_ARBITER_PROMPT,
  };

  constructor(options?: CheckpointArbiterServiceOptions) {
    if (options) {
      this.updateOptions(options);
    }
  }

  updateOptions(options?: CheckpointArbiterServiceOptions) {
    if (!options) return;
    const merged: CheckpointArbiterServiceOptions = {
      ...this.options,
      ...options,
    };
    if (typeof merged.promptTemplate === 'string') {
      const normalized = merged.promptTemplate.replace(/\r/g, '').trim();
      merged.promptTemplate = normalized ? normalized.slice(0, PROMPT_LENGTH_LIMIT) : DEFAULT_ARBITER_PROMPT;
    } else {
      merged.promptTemplate = this.options.promptTemplate ?? DEFAULT_ARBITER_PROMPT;
    }
    this.options = merged;
  }

  clear(): void {
    this.queue.length = 0;
  }

  evaluate(request: CheckpointEvalRequest): Promise<CheckpointEvalPayload> {
    if (this.disposed) {
      return Promise.reject(new Error('CheckpointArbiterService disposed'));
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
        const promptTemplate = this.options?.promptTemplate ?? DEFAULT_ARBITER_PROMPT;
        const prompt = buildEvalPrompt(job.request, transcript, promptTemplate);
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

        const payload: CheckpointEvalPayload = {
          request: job.request,
          raw,
          parsed,
          outcome,
          nextEdgeId: parsed?.nextEdgeId ?? null,
        };
        try { job.resolve(payload); } catch (err) { console.warn('[Story - CheckpointArbiter] resolve failed', err); }
        try { this.options?.onEvaluated?.(payload); } catch (err) { console.warn('[Story - CheckpointArbiter] onEvaluated handler failed', err); }
        if (outcome === 'win') {
          this.queue.length = 0;
          break;
        }
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
