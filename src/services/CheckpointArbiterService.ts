import { clampText } from "../utils/story-state";
import { chat, generateQuietPrompt } from "@services/SillyTavernAPI";
import {
  ARBITER_SNAPSHOT_LIMIT,
  ARBITER_RESPONSE_LENGTH,
  ARBITER_PROMPT_MAX_LENGTH,
  ARBITER_CHAT_NAME_CLAMP,
  ARBITER_CHAT_MESSAGE_CLAMP,
  ARBITER_LOG_SAMPLE_LENGTH,
} from "@constants/defaults";

export const DEFAULT_ARBITER_PROMPT = "You are an impartial story overseer.";

export type ArbiterReason = "trigger" | "timed" | "interval" | "manual";

export interface ArbiterTransitionOption {
  id: string;
  condition: string;
  label?: string;
  description?: string;
  targetName?: string;
  triggerLabel?: string;
  triggerPattern?: string;
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
  nextTransitionId?: string | null;
  reason?: string;
  confidence?: number;
}

export interface CheckpointEvalPayload {
  request: CheckpointEvalRequest;
  raw: string;
  parsed: ModelEval | null;
  outcome: EvaluationOutcome;
  nextTransitionId?: string | null;
}

export interface CheckpointArbiterApi {
  evaluate: (request: CheckpointEvalRequest) => Promise<CheckpointEvalPayload>;
  clear: () => void;
  updateOptions: (options?: CheckpointArbiterServiceOptions) => void;
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

function snapshot(limit: number): string {
  return (Array.isArray(chat) ? chat.slice(-limit) : [])
    .map((msg, idx) => {
      const text = (msg?.mes || msg?.text || msg?.message || msg?.data?.text || msg?.data?.mes || "") as string;
      if (typeof text !== "string" || !text.trim()) return null;
      const who = (msg?.name || msg?.character || (msg?.is_user ? "Player" : "Companion")) as string;
      return `${idx + 1}. ${clampText(String(who), ARBITER_CHAT_NAME_CLAMP)}: ${clampText(String(text).trim(), ARBITER_CHAT_MESSAGE_CLAMP)}`;
    })
    .filter(Boolean)
    .reverse()
    .join("\n");
}

function buildReasonLine(reason: ArbiterReason, matched: string | undefined, intervalTurns: number): string {
  switch (reason) {
    case "interval":
      return `Periodic check (every ${intervalTurns} turns).`;
    case "timed":
      return `Timed trigger reached${matched ? `: ${matched}` : ""}.`;
    case "trigger":
      return `Objective trigger detected${matched ? `: ${matched}` : ""}.`;
    case "manual":
    default:
      return matched ? `Manual review requested: ${matched}` : "Manual review requested.";
  }
}

function formatTransitionOption(option: ArbiterTransitionOption, idx: number): string {
  const pieces: string[] = [];
  const header = `${idx + 1}. [${option.id}] ${option.condition}`;
  pieces.push(header.trim());

  const meta: string[] = [];
  if (option.label) meta.push(option.label);
  if (option.targetName) meta.push(`Next: ${option.targetName}`);
  if (meta.length) {
    pieces.push(`   ${meta.join(" | ")}`);
  }

  if (option.description) {
    pieces.push(`   ${option.description}`);
  }

  const triggerInfo: string[] = [];
  if (option.triggerLabel) triggerInfo.push(option.triggerLabel);
  if (option.triggerPattern) triggerInfo.push(`Pattern: ${option.triggerPattern}`);
  if (triggerInfo.length) {
    pieces.push(`   ${triggerInfo.join(" | ")}`);
  }

  return pieces.join("\n");
}

function buildTransitionsSection(options: ArbiterTransitionOption[]): string {
  if (!options || !options.length) return "";
  const lines: string[] = ["Evaluate the candidate transitions below. Select at most one to advance."];
  options.forEach((opt, idx) => {
    lines.push(formatTransitionOption(opt, idx));
  });
  lines.push('If none should advance, respond with {"advance": false}.');
  return lines.join("\n");
}

function buildEvalPrompt(request: CheckpointEvalRequest, transcript: string, promptTemplate?: string) {
  const { cpName, checkpointObjective, reason, matched, turn, latestText, intervalTurns, candidates } = request;
  const transitionSection = buildTransitionsSection(candidates);
  const header = typeof promptTemplate === "string" && promptTemplate.trim()
    ? promptTemplate.replace(/\r/g, "").trim()
    : DEFAULT_ARBITER_PROMPT;
  const headerLines = header.split(/\n/).map((line) => line.trim()).filter((line) => Boolean(line));
  const lines: string[] = [
    ...headerLines,
    `Checkpoint: ${cpName}`,
    ...(checkpointObjective ? [`Objective: ${checkpointObjective}`] : []),
    `Reason for review: ${buildReasonLine(reason, matched, intervalTurns)}`,
    `Turn index: ${turn}`,
    "",
    "Latest player message:",
    clampText(latestText, ARBITER_CHAT_MESSAGE_CLAMP),
  ];

  if (transcript) {
    lines.push("", "Recent conversation (most recent first):", transcript);
  }

  if (transitionSection) {
    lines.push("", transitionSection);
  }

  lines.push(
    "",
    "Respond with concise JSON only, using the shape:",
    '{"advance": boolean, "next_transition": string | null, "confidence": number?}',
    'If no transition should advance, send {"advance": false, "next_transition": null}.',
  );

  return lines.join("\n");
}

function parseModel(raw: string): ModelEval | null {
  if (!raw) return null;
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return null;
  try {
    const obj = JSON.parse(jsonMatch[0]);
    const advance: boolean | undefined =
      typeof obj.advance === "boolean"
        ? obj.advance
        : typeof obj.completed === "boolean"
          ? obj.completed
          : undefined;
    if (advance === undefined) return null;

    const next =
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

    const reason = typeof obj.reason === "string" ? obj.reason : undefined;

    return {
      advance,
      nextTransitionId: next === null || next === undefined ? null : String(next),
      confidence,
      reason,
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
    if (typeof merged.promptTemplate === "string") {
      const normalized = merged.promptTemplate.replace(/\r/g, "").trim();
      merged.promptTemplate = normalized ? normalized.slice(0, ARBITER_PROMPT_MAX_LENGTH) : DEFAULT_ARBITER_PROMPT;
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
        const transcript = snapshot(this.options?.snapshotLimit ?? ARBITER_SNAPSHOT_LIMIT);
        const promptTemplate = this.options?.promptTemplate ?? DEFAULT_ARBITER_PROMPT;
        const prompt = buildEvalPrompt(job.request, transcript, promptTemplate);
        console.log("[Story - CheckpointArbiter] prompt", { reason: job.request.reason, cp: job.request.cpName, turn: job.request.turn });

        let raw = "";
        try {
          raw = await generateQuietPrompt({
            quietPrompt: prompt,
            quietName: "Checkpoint Arbiter",
            skipWIAN: true,
            quietToLoud: false,
            removeReasoning: false,
            trimToSentence: false,
            responseLength: this.options?.responseLength ?? ARBITER_RESPONSE_LENGTH,
          });
          console.log("[Story - CheckpointArbiter] raw response", { sample: String(raw).slice(0, ARBITER_LOG_SAMPLE_LENGTH) });
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
          void this.drain();
        });
      }
    }
  }
}

export default CheckpointArbiterService;
