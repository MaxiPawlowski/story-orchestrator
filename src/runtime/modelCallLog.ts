import type { ModelPass } from "@extraction/modelRoute";
import type { PassRole } from "@extraction/passRole";
import type { ModelFailureKind } from "@services/STAPI";
import { isRecord } from "@utils/guards";

export const MODEL_CALL_LIMIT = 300;

export type ModelCallResult = "ok" | "fallback" | ModelFailureKind;

export interface ModelCallRecord {
  at: string;
  role: PassRole;
  pass: ModelPass;
  route: string;
  result: ModelCallResult;
  ms: number;
  spawnMs?: number;
  inputTokens?: number;
  outputTokens?: number;
  costUsd?: number;
  fallbackFrom?: string;
  samplers: "applied" | "not-applied";
}

export interface RouteMeter {
  route: string;
  calls: number;
  ok: number;
  failed: number;
  fallback: number;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
}

const str = (value: unknown): value is string => typeof value === "string" && value.length > 0;
const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);

const sanitizeRecord = (value: unknown): ModelCallRecord | null => {
  if (!isRecord(value) || !str(value.at) || !str(value.role) || !str(value.pass) || !str(value.route) || !str(value.result) || !finite(value.ms)) return null;
  const record = { at: value.at, role: value.role, pass: value.pass, route: value.route, result: value.result, ms: value.ms, samplers: value.samplers === "applied" ? "applied" : "not-applied" } as ModelCallRecord;
  for (const key of ["spawnMs", "inputTokens", "outputTokens", "costUsd"] as const) { const item = value[key]; if (finite(item)) record[key] = item; }
  if (str(value.fallbackFrom)) record.fallbackFrom = value.fallbackFrom;
  return record;
};

export const sanitizeModelCalls = (value: unknown): ModelCallRecord[] =>
  (Array.isArray(value) ? value.map(sanitizeRecord).filter((record): record is ModelCallRecord => record !== null).slice(-MODEL_CALL_LIMIT) : []);

export const appendModelCall = (ring: readonly ModelCallRecord[], record: ModelCallRecord): ModelCallRecord[] => [...ring, record].slice(-MODEL_CALL_LIMIT);

export const routeMeters = (ring: readonly ModelCallRecord[]): RouteMeter[] => {
  const meters = new Map<string, RouteMeter>();
  for (const record of ring) {
    const meter = meters.get(record.route) ?? { route: record.route, calls: 0, ok: 0, failed: 0, fallback: 0, inputTokens: 0, outputTokens: 0, costUsd: 0 };
    meter.calls += 1;
    if (record.result === "ok") meter.ok += 1;
    else if (record.result === "fallback") meter.fallback += 1;
    else meter.failed += 1;
    meter.inputTokens += record.inputTokens ?? 0;
    meter.outputTokens += record.outputTokens ?? 0;
    meter.costUsd += record.costUsd ?? 0;
    meters.set(record.route, meter);
  }
  return [...meters.values()];
};

class ModelCallLog {
  private sink: ((record: ModelCallRecord) => void) | null = null;

  attach(sink: (record: ModelCallRecord) => void): () => void {
    this.sink = sink;
    return () => {
      if (this.sink === sink) this.sink = null;
    };
  }

  note(record: ModelCallRecord): void {
    this.sink?.(record);
  }
}

export const modelCallLog = new ModelCallLog();
