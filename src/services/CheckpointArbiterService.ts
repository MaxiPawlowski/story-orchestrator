import { getContext } from "@services/STAPI";
import { updateStoryMacroSnapshot } from "@utils/story-macros";
import { continueWhileIncomplete } from "@utils/continuation";
import {
  ARBITER_RESPONSE_LENGTH,
  ARBITER_LOG_SAMPLE_LENGTH,
} from "@constants/defaults";

interface GenerateRawOptions {
  prompt: string;
  instructOverride?: boolean;
  quietToLoud?: boolean;
  responseLength?: number;
  trimNames?: boolean;
}


export type ArbiterReason = "trigger" | "timed" | "interval" | "manual";

export interface ArbiterTransitionOption {
  id: string;
  condition?: string;
  label?: string;
  description?: string;
  targetName?: string;
}

export interface CheckpointEvalRequest {
  cpName: string;
  checkpointObjective?: string;
  latestText: string;
  reason: ArbiterReason;
  matched?: string;
  turn: number;
  intervalTurns: number;
  candidates: ArbiterTransitionOption[];
}

export type EvaluationOutcome = "advance" | "continue";

export interface ModelEval {
  advance: boolean;
  decision?: "transition" | "continue";
  nextTransitionId?: string | null;
  reason?: string;
  confidence?: number;
  tension?: number | null;
  pacingDriftNote?: string;
  observedEvents?: string[];
}

export interface CheckpointEvalPayload {
  request: CheckpointEvalRequest;
  raw: string;
  parsed: ModelEval | null;
  outcome: EvaluationOutcome;
  nextTransitionId?: string | null;
  tension?: number | null;
  pacingDriftNote?: string;
  observedEvents?: string[];
}

export interface CheckpointArbiterApi {
  evaluate: (request: CheckpointEvalRequest) => Promise<CheckpointEvalPayload>;
  clear: () => void;
  updateOptions: (options?: Partial<CheckpointArbiterServiceOptions>) => void;
}

export interface CheckpointArbiterServiceOptions {
  onEvaluated?: (payload: CheckpointEvalPayload) => void;
  snapshotLimit: number;
  responseLength: number;
  promptTemplate: string;
  enableContinuation?: boolean;
  maxContinuationAttempts?: number;
}

interface PendingJob {
  request: CheckpointEvalRequest;
  resolve: (payload: CheckpointEvalPayload) => void;
}

function snapshot(limit: number): string {
  const { chat } = getContext();
  return chat.slice(-limit)
    .map((msg, idx) => {
      const text = (msg.mes ?? "").trim();
      if (!text) return null;
      const who = msg.name || (msg.is_user ? "Player" : "Companion");
      return `${idx + 1}. ${who}: ${text}`;
    })
    .filter(Boolean)
    .reverse()
    .join("\n");
}

function buildEvalPrompt(_request: CheckpointEvalRequest, promptTemplate: string) {
  const prompt = promptTemplate.replace(/\r/g, "").trim();
  const promptLines: string[] = [
    prompt,
    "",
    "=== Output Format (JSON ONLY) ===",
    "Return ONLY a JSON object with this exact schema (no code fences, no extra text):",
    "",
    "{",
    '  "decision": "transition" | "continue",',
    '  "selected_transition_id": "STRING or null",',
    '  "reason": "SHORT FACTUAL EXPLANATION",',
    '  "confidence": 0.0 to 1.0,',
    '  "tension": 0.0 to 1.0 or null,',
    '  "pacing_drift_note": "OPTIONAL SHORT NOTE" or null,',
    '  "observed_events": ["OPTIONAL SHORT FACTUAL EVENT", "..."]',
    "}"
  ];

  return promptLines.join("\n");
}

function parseModel(raw: string): ModelEval | null {
  if (!raw) return null;
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return null;
  try {
    const obj = JSON.parse(jsonMatch[0]);
    const toObservedEvents = (value: unknown): string[] | undefined => {
      if (!Array.isArray(value)) return undefined;
      const observedEvents = value
        .filter((entry): entry is string => typeof entry === "string")
        .map((entry) => entry.trim())
        .filter(Boolean);
      return observedEvents.length ? observedEvents : undefined;
    };
    const normalizeDecision = (value: unknown): "transition" | "continue" | undefined => {
      if (typeof value !== "string") return undefined;
      const normalized = value.trim().toLowerCase();
      if (["transition", "advance", "win", "advance_checkpoint"].includes(normalized)) return "transition";
      if (["continue", "none", "stay", "hold"].includes(normalized)) return "continue";
      return undefined;
    };

    const decision = normalizeDecision(obj.decision ?? obj.choice ?? obj.outcome);
    let advance: boolean | undefined;

    if (decision) {
      advance = decision === "transition";
    } else if (typeof obj.advance === "boolean") {
      advance = obj.advance;
    } else if (typeof obj.completed === "boolean") {
      advance = obj.completed;
    }

    if (advance === undefined) return null;

    const next =
      obj.selected_transition_id ??
      obj.next_transition ??
      obj.nextTransition ??
      obj.next_edge ??
      obj.nextEdge ??
      obj.nextEdgeId ??
      null;

    const confidence = typeof obj.confidence === "number"
      ? obj.confidence
      : typeof obj.score === "number"
        ? obj.score
        : undefined;

    const rawTension = obj.tension ?? obj.scene_tension ?? obj.sceneTension;
    const tensionValue = typeof rawTension === "number"
      ? rawTension
      : typeof rawTension === "string"
        ? Number(rawTension.trim())
        : Number.NaN;
    const tension = Number.isFinite(tensionValue)
      ? Math.max(0, Math.min(1, tensionValue))
      : null;

    const pacingDriftNoteSource = obj.pacing_drift_note ?? obj.pacingDriftNote;
    const pacingDriftNote = typeof pacingDriftNoteSource === "string"
      ? pacingDriftNoteSource.trim() || undefined
      : undefined;

    const reason = typeof obj.reason === "string" ? obj.reason : undefined;
    const observedEvents = toObservedEvents(obj.observed_events ?? obj.observedEvents);

    return {
      advance,
      decision,
      nextTransitionId: next === null || next === undefined ? null : String(next),
      confidence,
      tension,
      pacingDriftNote,
      reason,
      observedEvents,
    };
  } catch (err) {
    console.warn("[Story - CheckpointArbiter] JSON parse failed", err);
    return null;
  }
}

function resolveOutcome(parsed: ModelEval | null): EvaluationOutcome {
  if (!parsed) return "continue";
  return parsed.advance ? "advance" : "continue";
}

class CheckpointArbiterService implements CheckpointArbiterApi {
  private queue: PendingJob[] = [];
  private busy = false;
  private disposed = false;
  private options: CheckpointArbiterServiceOptions;
  constructor(options: CheckpointArbiterServiceOptions) {
    this.options = options;

  }

  private isTruncated(raw: string): boolean {
    if (!raw || !raw.trim()) return false;

    const trimmed = raw.trim();

    const jsonMatch = trimmed.match(/\{[\s\S]*$/);
    if (!jsonMatch) return false;

    const jsonPart = jsonMatch[0];

    let braceCount = 0;
    let inString = false;
    let escapeNext = false;

    for (const char of jsonPart) {
      if (escapeNext) {
        escapeNext = false;
        continue;
      }
      if (char === '\\') {
        escapeNext = true;
        continue;
      }
      if (char === '"') {
        inString = !inString;
        continue;
      }
      if (!inString) {
        if (char === '{') braceCount++;
        if (char === '}') braceCount--;
      }
    }

    if (braceCount !== 0) {
      return true;
    }

    // Check if it ends mid-property (e.g., ends with comma or colon)
    if (/[,:]\s*$/.test(trimmed)) {
      return true;
    }

    return false;
  }

  private async continueGeneration(
    previousResponse: string,
    generateRaw: (options: GenerateRawOptions) => Promise<string>,
    maxAttempts = 2
  ): Promise<string> {
    return continueWhileIncomplete({
      initialText: previousResponse,
      maxAttempts,
      isIncomplete: (text) => this.isTruncated(text),
      buildRequest: (text) => ({
        prompt: `Continue the previous JSON response. Complete it without repeating what was already written:\n\n${text}`,
        instructOverride: true,
        quietToLoud: false,
        responseLength: this.options?.responseLength ?? ARBITER_RESPONSE_LENGTH,
        trimNames: false,
      }),
      requestContinuation: generateRaw,
      onEmptyResponse: () => {
        console.warn("[Story - CheckpointArbiter] Continuation returned empty");
      },
      onAttemptFailed: (err) => {
        console.warn("[Story - CheckpointArbiter] Continuation attempt failed", err);
      },
    });
  }

  updateOptions(options?: Partial<CheckpointArbiterServiceOptions>) {
    if (!options) return;
    const merged: CheckpointArbiterServiceOptions = {
      ...this.options,
      ...options,
    };
    if (typeof merged.promptTemplate === "string") {
      merged.promptTemplate = merged.promptTemplate.replace(/\r/g, "").trim();
    } else {
      merged.promptTemplate = this.options.promptTemplate;
    }
    this.options = merged;
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
          this.drain();
        });
      }
    });
  }

  private async drain(): Promise<void> {
    const { generateRaw } = getContext();
    if (this.busy || this.disposed) return;
    this.busy = true;
    try {
      while (!this.disposed && this.queue.length) {
        const job = this.queue.shift()!;
        const transcript = snapshot(this.options?.snapshotLimit);
        updateStoryMacroSnapshot({ chatExcerpt: transcript });

        const promptTemplate = this.options?.promptTemplate;
        const prompt = buildEvalPrompt(job.request, promptTemplate);
        console.log("[Story - CheckpointArbiter] prompt", { reason: job.request.reason, cp: job.request.cpName, turn: job.request.turn, prompt });
        let raw = "";
        try {
          raw = await generateRaw({
            prompt,
            instructOverride: true,
            quietToLoud: false,
            responseLength: this.options?.responseLength ?? ARBITER_RESPONSE_LENGTH,
            trimNames: false,
          });
          console.log("[Story - CheckpointArbiter] raw response", { sample: String(raw).slice(0, ARBITER_LOG_SAMPLE_LENGTH) });

          const continuationEnabled = this.options?.enableContinuation ?? true;
          if (raw && continuationEnabled && this.isTruncated(raw)) {
            console.log("[Story - CheckpointArbiter] Response appears truncated, attempting continuation");
            const maxAttempts = this.options?.maxContinuationAttempts ?? 2;
            const continuation = await this.continueGeneration(raw, generateRaw, maxAttempts);
            if (continuation) {
              raw = raw + continuation;
            }
          }
        } catch (err) {
          console.warn("[Story - CheckpointArbiter] request failed", err);
        }

        const parsed = raw ? parseModel(raw) : null;
        if (raw && !parsed) console.warn("[Story - CheckpointArbiter] parse failed", { sample: String(raw).slice(0, ARBITER_LOG_SAMPLE_LENGTH) });
        const outcome = resolveOutcome(parsed);
        console.log("[Story - CheckpointArbiter] outcome", { outcome, parsed });

        const payload: CheckpointEvalPayload = {
          request: job.request,
          raw,
          parsed,
          outcome,
          nextTransitionId: parsed?.nextTransitionId ?? null,
          tension: parsed?.tension ?? null,
          pacingDriftNote: parsed?.pacingDriftNote,
          observedEvents: parsed?.observedEvents,
        };
        try { job.resolve(payload); } catch (err) { console.warn("[Story - CheckpointArbiter] resolve failed", err); }
        try { this.options?.onEvaluated?.(payload); } catch (err) { console.warn("[Story - CheckpointArbiter] onEvaluated handler failed", err); }
        if (outcome === "advance") {
          this.queue.length = 0;
          break;
        }
      }
    } finally {
      this.busy = false;
      if (!this.disposed && this.queue.length) {
        queueMicrotask(() => {
          this.drain();
        });
      }
    }
  }
}

export default CheckpointArbiterService;
