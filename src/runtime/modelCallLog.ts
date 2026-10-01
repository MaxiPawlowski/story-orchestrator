import type { CallUsage, ModelPass } from "@extraction/modelRoute";
import type { PassRole } from "@extraction/passRole";
import type { ModelFailureKind } from "@services/STAPI";
import { isRecord } from "@utils/guards";

export const MODEL_CALL_LIMIT = 300;

export interface ModelCallRecord {
  at: string;
  role: PassRole;
  pass: ModelPass;
  route: string;
  result: "ok" | "fallback" | ModelFailureKind;
  ms: number;
  spawnMs?: number | null;
  usage?: CallUsage;
  fallbackFrom?: string;
  samplers: "applied" | "not-applied";
  chatId?: string | null;
  messageId?: number;
}

const REQUIRED = ["at", "role", "pass", "route", "result"] as const;

export const sanitizeModelCalls = (value: unknown): ModelCallRecord[] => (Array.isArray(value)
  ? value.filter((row): row is ModelCallRecord => isRecord(row) && REQUIRED.every((key) => typeof row[key] === "string") && typeof row.ms === "number").slice(-MODEL_CALL_LIMIT)
  : []);

export const appendModelCall = (ring: readonly ModelCallRecord[], record: ModelCallRecord): ModelCallRecord[] => [...ring, record].slice(-MODEL_CALL_LIMIT);

export const acceptModelCall = (ring: ModelCallRecord[], record: ModelCallRecord, chatId: string | null): ModelCallRecord[] =>
  (record.chatId !== undefined && record.chatId !== chatId ? ring : appendModelCall(ring, record));

export const rollbackModelCalls = (ring: ModelCallRecord[], messageId: number): ModelCallRecord[] =>
  ring.filter((record) => typeof record.messageId !== "number" || record.messageId < messageId);

let sink: ((record: ModelCallRecord) => void) | null = null;

export const modelCallLog = {
  attach(next: (record: ModelCallRecord) => void): () => void {
    sink = next;
    return () => {
      if (sink === next) sink = null;
    };
  },
  note(record: ModelCallRecord): void {
    sink?.(record);
  },
};
