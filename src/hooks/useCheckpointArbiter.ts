import { useCallback, useEffect, useMemo, useRef } from "react";
import { chat, generateQuietPrompt } from "@services/SillyTavernAPI";
import type {
  CheckpointArbiterApi,
  CheckpointEvalRequest,
  CheckpointEvalPayload,
  EvaluationOutcome,
  ModelEval,
} from "@services/StoryService/checkpoint-arbiter-types";

export interface UseCheckpointArbiterOptions {
  onEvaluated?: (payload: CheckpointEvalPayload) => void;
  snapshotLimit?: number;
  responseLength?: number;
}

interface PendingJob {
  request: CheckpointEvalRequest;
  resolve: (payload: CheckpointEvalPayload) => void;
}

interface InternalOptions extends UseCheckpointArbiterOptions { }

const DEFAULT_SNAPSHOT_LIMIT = 10;
const DEFAULT_RESPONSE_LENGTH = 256;

function clamp(s: string, n: number) {
  const t = (s || "").replace(/\s+/g, " ").trim();
  return t.length <= n ? t : `${t.slice(0, n - 3)}...`;
}

function snapshot(limit: number): string {
  const msgs = Array.isArray(chat) ? chat.slice(-limit) : [];
  const lines: string[] = [];
  for (let i = 0; i < msgs.length; i++) {
    const m = msgs[i];
    const text =
      (typeof m?.mes === "string" && m.mes.trim()) ||
      (typeof m?.text === "string" && m.text.trim()) ||
      (typeof m?.message === "string" && m.message.trim()) ||
      (typeof m?.data?.text === "string" && m.data.text.trim()) ||
      (typeof m?.data?.mes === "string" && m.data.mes.trim()) ||
      "";
    if (!text) continue;
    const who =
      (typeof m?.name === "string" && m.name) ||
      (typeof m?.character === "string" && m.character) ||
      (m?.is_user ? "Player" : "Companion");
    lines.push(`${i + 1}. ${clamp(String(who), 40)}: ${clamp(text, 300)}`);
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
    clamp(latestText, 240),
    "",
    "Respond ONLY with JSON. Example:",
    '{"completed": true, "failed": false, "reason": "...", "confidence": 0.95}',
  ].filter(Boolean).join("\n");
}

function parseModel(raw: unknown): ModelEval | null {
  let s = typeof raw === "string" ? raw.trim() : "";
  if (!s) return null;

  if (/^```/m.test(s)) {
    s = s.replace(/```(?:json)?\s*([\s\S]*?)\s*```/gi, "$1").trim();
  }

  const blocks = [...s.matchAll(/\{[\s\S]*?\}/g)].map((m) => m[0]);
  const candidate = blocks.sort((a, b) => b.length - a.length)[0] || s;

  const toBool = (v: any): boolean | null => {
    if (typeof v === "boolean") return v;
    if (typeof v === "number") return v !== 0;
    if (typeof v === "string") {
      const t = v.trim().toLowerCase();
      if (t === "true") return true;
      if (t === "false") return false;
    }
    return null;
  };

  const tryJson = (x: string) => {
    try {
      const obj = JSON.parse(x);
      const cRaw = obj.completed ?? obj.complete ?? obj.answer;
      const fRaw = obj.failed ?? obj.failure ?? obj.lose;
      const c = toBool(cRaw);
      const f = toBool(fRaw);
      if (c === null && f === null) return null;
      const out: ModelEval = {
        completed: !!c,
        failed: !!f,
        reason: typeof obj.reason === "string" ? clamp(obj.reason, 200) : undefined,
        confidence: typeof obj.confidence === "number"
          ? Math.max(0, Math.min(1, obj.confidence))
          : undefined,
      };
      if (out.completed) out.failed = false;
      if (out.failed) out.completed = false;
      return out;
    } catch {
      return null;
    }
  };

  const parsed = tryJson(candidate) || tryJson(s);
  if (parsed) return parsed;

  const boolKey = (key: string) => {
    const re = new RegExp(`"${key}"\\s*:\\s*(true|false)`, "i");
    const m = s.match(re);
    if (m) return m[1].toLowerCase() === "true";
    return null;
  };

  const completed = boolKey("completed");
  const failed = boolKey("failed");
  if (completed !== null || failed !== null) {
    const out: ModelEval = {
      completed: !!completed,
      failed: !!failed,
    };
    if (out.completed) out.failed = false;
    if (out.failed) out.completed = false;
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

type CheckpointArbiterHandle = CheckpointArbiterApi & { isBusy: () => boolean };

export function useCheckpointArbiter(options?: UseCheckpointArbiterOptions): CheckpointArbiterHandle {
  const queueRef = useRef<PendingJob[]>([]);
  const busyRef = useRef(false);
  const optionsRef = useRef<InternalOptions | undefined>(options);

  useEffect(() => {
    optionsRef.current = options;
  }, [options]);

  const drain = useCallback(async () => {
    if (busyRef.current) return;
    busyRef.current = true;
    try {
      while (queueRef.current.length) {
        const job = queueRef.current.shift()!;
        const request = job.request;
        const snapshotLimit = optionsRef.current?.snapshotLimit ?? DEFAULT_SNAPSHOT_LIMIT;
        const transcript = snapshot(snapshotLimit);
        const prompt = buildEvalPrompt(request, transcript);

        console.log("[Story - CheckpointArbiter] prompt", { reason: request.reason, cp: request.cpName, turn: request.turn });

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
            responseLength: optionsRef.current?.responseLength ?? DEFAULT_RESPONSE_LENGTH,
          });
          console.log("[Story - CheckpointArbiter] raw response", { sample: String(raw).slice(0, 200) });
        } catch (err) {
          console.warn("[Story - CheckpointArbiter] request failed", err);
        }

        if (raw) {
          parsed = parseModel(raw);
        }

        if (!parsed) {
          if (raw) {
            console.warn("[Story - CheckpointArbiter] parse failed", { sample: String(raw).slice(0, 200) });
          }
        }

        const outcome = resolveOutcome(parsed);
        console.log("[Story - CheckpointArbiter] outcome", { outcome, parsed });

        const payload: CheckpointEvalPayload = {
          request,
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
          optionsRef.current?.onEvaluated?.(payload);
        } catch (err) {
          console.warn("[Story - CheckpointArbiter] onEvaluated handler failed", err);
        }

        if (outcome === "win") {
          queueRef.current.length = 0;
          break;
        }
      }
    } finally {
      busyRef.current = false;
      if (queueRef.current.length) {
        queueMicrotask(drain);
      }
    }
  }, []);

  const evaluate = useCallback((request: CheckpointEvalRequest) => {
    return new Promise<CheckpointEvalPayload>((resolve) => {
      queueRef.current.push({ request, resolve });
      if (!busyRef.current) {
        queueMicrotask(drain);
      }
    });
  }, [drain]);

  const clear = useCallback(() => {
    queueRef.current.length = 0;
  }, []);

  const isBusy = useCallback(() => busyRef.current || queueRef.current.length > 0, []);

  return useMemo(() => ({ evaluate, clear, isBusy }), [evaluate, clear, isBusy]);
}
