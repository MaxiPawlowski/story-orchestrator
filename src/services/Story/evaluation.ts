// src/services/story/evaluation.ts
import type {
  EvaluationDetails,
  EvaluationRequest,
  ModelEvaluationResponse,
  YesNo,
} from './types';
import { chat, generateQuietPrompt } from '@services/SillyTavernAPI';

export const MODEL_EVALUATION_SCHEMA = {
  type: 'object',
  properties: {
    completed: { type: 'string', enum: ['YES', 'NO'] },
    failed: { type: 'string', enum: ['YES', 'NO'] },
    reason: { type: 'string' },
    confidence: { type: 'number', minimum: 0, maximum: 1 },
  },
  required: ['completed', 'failed'],
  additionalProperties: false,
} as const;

export async function runModelEvaluation(
  cpName: string,
  objective: string,
  request: EvaluationRequest,
  log: (lvl: 'debug' | 'info' | 'warn' | 'error', msg: string, data?: any) => void,
): Promise<EvaluationDetails> {
  const transcript = buildConversationSnapshot();
  const prompt = buildEvaluationPrompt({ cpName, objective, transcript, request });

  const details: EvaluationDetails = {
    request,
    raw: '',
    parsed: null,
    outcome: 'continue',
    completed: false,
    failed: false,
  };

  if (typeof generateQuietPrompt !== 'function') {
    details.error = new Error('generateQuietPrompt unavailable');
    log('warn', 'Cannot run evaluation: generateQuietPrompt unavailable');
    return details;
  }

  try {
    log('info', 'Sending evaluation prompt', {
      checkpoint: cpName,
      objectiveSummary: objective ? objective.slice(0, 80) : '',
      reason: request.reason,
      turn: request.turn,
    });

    const raw = await generateQuietPrompt({
      quietPrompt: prompt,
      quietName: 'Checkpoint Arbiter',
      jsonSchema: MODEL_EVALUATION_SCHEMA,
      removeReasoning: true,
    });

    details.raw = typeof raw === 'string' ? raw.trim() : '';
    log('debug', 'Model responded', { rawSample: details.raw.slice(0, 200) });
  } catch (err) {
    details.error = err;
    log('error', 'Model evaluation failed', { err });
    return details;
  }

  const parsed = parseEvaluationResponse(details.raw);
  details.parsed = parsed;

  if (parsed) {
    details.completed = parsed.completed === 'YES';
    details.failed = !details.completed && parsed.failed === 'YES';
    details.outcome = details.completed ? 'win' : details.failed ? 'fail' : 'continue';
    log('info', 'Parsed evaluation', {
      completed: details.completed,
      failed: details.failed,
      reason: parsed.reason,
      confidence: parsed.confidence,
    });
  } else if (details.raw) {
    log('warn', 'Could not parse evaluation JSON', { raw: details.raw });
  }

  return details;
}

function buildEvaluationPrompt(params: {
  cpName: string;
  objective: string;
  transcript: string;
  request: EvaluationRequest;
}): string {
  const { cpName, objective, transcript, request } = params;
  const lines: string[] = [];

  lines.push('You are an impartial story overseer. Evaluate if the player completed or failed the current objective.');
  lines.push(`Current checkpoint: ${cpName || '(unnamed checkpoint)'}.`);
  if (objective) lines.push(`Objective: ${objective}`);
  lines.push(describeTrigger(request));
  lines.push(`Player turn count at evaluation: ${request.turn}.`);
  lines.push('');
  lines.push('Conversation excerpt (latest first is acceptable):');
  lines.push(transcript || 'No recent messages available.');
  if (request.text) {
    lines.push('');
    lines.push('Latest player message:');
    lines.push(clamp(request.text, 240));
  }
  lines.push('');
  lines.push('Return ONLY JSON matching exactly: { "completed": "YES"|"NO", "failed": "YES"|"NO", "reason": string <= 120, "confidence": number 0..1 (optional) }');

  // Rules ensure consistency
  lines.push('Rules: completed "YES" ⇒ failed "NO". failed "YES" ⇒ completed "NO". If unsure set both "NO". Base judgment strictly on the provided text.');

  return lines.join('\n');
}

function describeTrigger(request: EvaluationRequest): string {
  switch (request.reason) {
    case 'win-trigger': return `A completion trigger matched the latest player message${request.matchedPattern ? ` (${request.matchedPattern})` : ''}.`;
    case 'fail-trigger': return `A failure trigger matched the latest player message${request.matchedPattern ? ` (${request.matchedPattern})` : ''}.`;
    default: return `Periodic progress check (every 3 turns).`;
  }
}

function buildConversationSnapshot(limit = 12): string {
  try {
    const messages = Array.isArray(chat) ? chat : [];
    if (!messages.length) return 'No chat history available yet.';
    const start = Math.max(0, messages.length - limit);
    const subset = messages.slice(start);
    const lines: string[] = [];
    subset.forEach((msg, idx) => {
      const text = extractMessageText(msg);
      if (!text) return;
      const speaker = resolveSpeakerName(msg);
      lines.push(`${idx + 1}. ${speaker}: ${text}`);
    });
    return lines.length ? lines.join('\n') : 'No meaningful messages extracted.';
  } catch {
    return 'Conversation context unavailable due to error.';
  }
}

function extractMessageText(message: any): string {
  if (!message) return '';
  const candidates = [message.mes, message.text, message.message, message.data?.text, message.data?.mes];
  for (const c of candidates) if (typeof c === 'string' && c.trim()) return clamp(c, 320);
  if (Array.isArray(message?.content)) {
    for (const chunk of message.content) {
      if (chunk && typeof chunk === 'object' && typeof chunk.text === 'string' && chunk.text.trim()) {
        return clamp(chunk.text, 320);
      }
    }
  }
  return '';
}

function resolveSpeakerName(message: any): string {
  if (!message) return 'Unknown';
  if (message.is_user === true) return 'Player';
  const candidates = [message.name, message.character, message.speaker, message.role, message.author];
  for (const c of candidates) if (typeof c === 'string' && c.trim()) return c.trim();
  if (message.is_system) return 'System';
  return 'Companion';
}

function clamp(s: string, n: number) {
  const t = s.replace(/\s+/g, ' ').trim();
  if (t.length <= n) return t;
  return `${t.slice(0, Math.max(0, n - 3))}...`;
}

// ---- parsing helpers ----
export function parseEvaluationResponse(raw: string): ModelEvaluationResponse | null {
  if (!raw || !raw.trim()) return null;
  const trimmed = raw.trim();
  const direct = tryParseModelJson(trimmed); if (direct) return direct;
  const match = trimmed.match(/\{[\s\S]*\}/); if (match) {
    const parsed = tryParseModelJson(match[0]); if (parsed) return parsed;
  }
  const upper = trimmed.toUpperCase();
  if (upper === 'YES') return { completed: 'YES', failed: 'NO' };
  if (upper === 'NO') return { completed: 'NO', failed: 'NO' };
  if (upper.includes('FAIL')) return { completed: 'NO', failed: 'YES' };
  if (upper.includes('COMPLETE')) return { completed: 'YES', failed: 'NO' };
  return null;
}

function tryParseModelJson(raw: string): ModelEvaluationResponse | null {
  try {
    const parsed = JSON.parse(raw);
    return normalizeModelResponse(parsed);
  } catch { return null; }
}

function normalizeYesNo(v: unknown): YesNo | null {
  if (v === true) return 'YES';
  if (v === false) return 'NO';
  if (typeof v !== 'string') return null;
  const x = v.trim().toUpperCase();
  return x === 'YES' ? 'YES' : x === 'NO' ? 'NO' : null;
}

function normalizeModelResponse(x: any): ModelEvaluationResponse | null {
  if (!x || typeof x !== 'object') return null;
  let completed = normalizeYesNo(x.completed ?? x.complete ?? x.hasCompleted ?? x.answer);
  let failed = normalizeYesNo(x.failed ?? x.failure ?? x.hasFailed ?? x.lose);
  if (!completed) return null;
  if (!failed) failed = 'NO';
  if (completed === 'YES') failed = 'NO';
  else if (failed === 'YES') completed = 'NO';

  const out: ModelEvaluationResponse = { completed, failed };
  if (typeof x.reason === 'string' && x.reason.trim()) out.reason = clamp(x.reason.trim(), 120);
  const sc = x.confidence ?? x.score;
  if (typeof sc === 'number' && Number.isFinite(sc)) out.confidence = Math.min(1, Math.max(0, sc));
  return out;
}
