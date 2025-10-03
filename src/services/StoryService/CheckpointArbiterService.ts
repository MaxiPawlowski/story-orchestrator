import { clampText } from './text-utils';
import { chat, generateQuietPrompt } from "@services/SillyTavernAPI";
import type {
  CheckpointArbiterApi,
  CheckpointEvalPayload,
  CheckpointEvalRequest,
  EvaluationOutcome,
  ModelEval,
} from "./checkpoint-arbiter-types";

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
  const msgs = Array.isArray(chat) ? chat.slice(-limit) : [];
  const lines: string[] = [];
  for (let i = 0; i < msgs.length; i++) {
    const msg = msgs[i];
    const text =
      (typeof msg?.mes === "string" && msg.mes.trim()) ||
      (typeof msg?.text === "string" && msg.text.trim()) ||
      (typeof msg?.message === "string" && msg.message.trim()) ||
      (typeof msg?.data?.text === "string" && msg.data.text.trim()) ||
      (typeof msg?.data?.mes === "string" && msg.data.mes.trim()) ||
      "";
    if (!text) continue;
    const who =
      (typeof msg?.name === "string" && msg.name) ||
      (typeof msg?.character === "string" && msg.character) ||
      (msg?.is_user ? "Player" : "Companion");
    lines.push(`${i + 1}. ${clampText(String(who), 40)}: ${clampText(text, 300)}`);
  }
  return lines.reverse().join("\n");
}

function buildEvalPrompt(request: CheckpointEvalRequest, transcript: string) {
  const { cpName, objective, reason, matched, turn, latestText, intervalTurns } = request;
  const reasonLine = reason === "interval"
    ? `Periodic check (every ${intervalTurns} turns).`
    : reason === "win"
      ? `Completion trigger matched${matched ? `: ${matched}` : ""}.`
      : `Failure trigger matched${matched ? `: ${matched}` : ""}.`;

  return [
    "You are an impartial story overseer.",
    `Checkpoint: ${cpName}`,
    objective ? `Objective: ${objective}` : "",
    reasonLine,
    `Player turn: ${turn}`,
    "",
    "Conversation excerpt (most recent first is fine):",
    transcript || "No recent messages.",
    "",
    "Latest player message:",
    clampText(latestText, 240),
    "",
    "Respond ONLY with JSON. Example:",
    '{"completed": true, "failed": false, "reason": "...", "confidence": 0.95}',
  ].filter(Boolean).join("\n");
}

function parseModel(raw: unknown): ModelEval | null {
  let text = typeof raw === "string" ? raw.trim() : "";
  if (!text) return null;

  if (/^```/m.test(text)) {
    text = text.replace(/```(?:json)?\s*([\s\S]*?)\s*```/gi, "$1").trim();
  }

  const blocks = [...text.matchAll(/\{[\s\S]*?\}/g)].map((m) => m[0]);
  const candidate = blocks.sort((a, b) => b.length - a.length)[0] || text;

  const toBool = (value: any): boolean | null => {
    if (typeof value === "boolean") return value;
    if (typeof value === "number") return value !== 0;
    if (typeof value === "string") {
      const normalized = value.trim().toLowerCase();
      if (normalized === "true") return true;
      if (normalized === "false") return false;
    }
    return null;
  };

  const tryJson = (input: string) => {
    try {
      const obj = JSON.parse(input);
      const completedRaw = obj.completed ?? obj.complete ?? obj.answer;
      const failedRaw = obj.failed ?? obj.failure ?? obj.lose;
      const completed = toBool(completedRaw);
      const failed = toBool(failedRaw);
      if (completed === null && failed === null) return null;
      const result: ModelEval = {
        completed: !!completed,
        failed: !!failed,
        reason: typeof obj.reason === "string" ? clampText(obj.reason, 200) : undefined,
        confidence: typeof obj.confidence === "number"
          ? Math.max(0, Math.min(1, obj.confidence))
          : undefined,
      };
      if (result.completed) result.failed = false;
      if (result.failed) result.completed = false;
      return result;
    } catch {
      return null;
    }
  };

  const parsed = tryJson(candidate) || tryJson(text);
  if (parsed) return parsed;

  const boolKey = (key: string) => {
    const match = text.match(new RegExp(`"${key}"\s*:\s*(true|false)`, "i"));
    if (match) return match[1].toLowerCase() === "true";
    return null;
  };

  const completed = boolKey("completed");
  const failed = boolKey("failed");
  if (completed !== null || failed !== null) {
    const inferred: ModelEval = {
      completed: !!completed,
      failed: !!failed,
    };
    if (inferred.completed) inferred.failed = false;
    if (inferred.failed) inferred.completed = false;
    return inferred;
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

  dispose(): void {
    this.disposed = true;
    this.clear();
  }

  isBusy(): boolean {
    return this.busy || this.queue.length > 0;
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
        const snapshotLimit = this.options?.snapshotLimit ?? DEFAULT_SNAPSHOT_LIMIT;
        const transcript = snapshot(snapshotLimit);
        const prompt = buildEvalPrompt(job.request, transcript);

        console.log("[Story - CheckpointArbiter] prompt", {
          reason: job.request.reason,
          cp: job.request.cpName,
          turn: job.request.turn,
        });

        let raw = "";
        let parsed: ModelEval | null = null;
        try {
          raw = await generateQuietPrompt({
            quietPrompt: prompt,
            quietName: "Checkpoint Arbiter",
            skipWIAN: true,
            quietToLoud: false,
            removeReasoning: false,
            trimToSentence: false,
            responseLength: this.options?.responseLength ?? DEFAULT_RESPONSE_LENGTH,
          });
          console.log("[Story - CheckpointArbiter] raw response", { sample: String(raw).slice(0, 200) });
        } catch (err) {
          console.warn("[Story - CheckpointArbiter] request failed", err);
        }

        if (raw) {
          parsed = parseModel(raw);
          if (!parsed) {
            console.warn("[Story - CheckpointArbiter] parse failed", {
              sample: String(raw).slice(0, 200),
            });
          }
        }

        const outcome = resolveOutcome(parsed);
        console.log("[Story - CheckpointArbiter] outcome", { outcome, parsed });

        const payload: CheckpointEvalPayload = {
          request: job.request,
          raw,
          parsed,
          outcome,
        };

        try {
          job.resolve(payload);
        } catch (err) {
          console.warn("[Story - CheckpointArbiter] resolve failed", err);
        }

        try {
          this.options?.onEvaluated?.(payload);
        } catch (err) {
          console.warn("[Story - CheckpointArbiter] onEvaluated handler failed", err);
        }

        if (outcome === "win") {
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

