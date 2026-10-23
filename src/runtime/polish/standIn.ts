import type { WriteResult } from "@utils/writeResult";
import { candidateKey, CONTINUED_TYPES, rowIneligible, writeMismatch, type AbandonReason, type ConsumptionLedger, type PolishRow } from "../../polish/ledger";
import { fingerprintOf } from "../fingerprints";
import type { RunGuard } from "../runToken";

export interface StandInConfig {
  delayMs?: number;
  find: string;
  replace: string;
  includeScripted?: boolean;
}

export interface StandInStats {
  settled: number;
  written: number;
  unchanged: number;
  skipped: number;
  failed: number;
  carryHides: number;
  abandoned: Partial<Record<AbandonReason, number>>;
}

export interface StandInDeps {
  ledger: ConsumptionLedger;
  config: () => StandInConfig | null;
  chatId: () => string;
  rows: () => unknown[];
  holdMs: () => number;
  run: () => RunGuard;
  ready: () => Promise<void>;
  write: (messageId: number, row: unknown, mes: string) => WriteResult;
  now: () => number;
  sleep: (ms: number) => Promise<void>;
}

const hash = (row: PolishRow) => fingerprintOf(row);

const revisionOf = (row: PolishRow) => `${String(row.send_date ?? "")}|${typeof row.swipe_id === "number" ? row.swipe_id : 0}`;

const transform = (text: string, config: StandInConfig) => (config.find ? text.split(config.find).join(config.replace) : text);

const hasReasoning = (row: unknown): boolean => {
  const extra = (row as { extra?: { reasoning?: unknown } }).extra;
  return typeof extra?.reasoning === "string" && extra.reasoning.trim().length > 0;
};

export function createStandIn(deps: StandInDeps) {
  const stats: StandInStats = { settled: 0, written: 0, unchanged: 0, skipped: 0, failed: 0, carryHides: 0, abandoned: {} };
  const seen = new Map<string, string>();
  const abandon = (reason: AbandonReason) => { stats.abandoned[reason] = (stats.abandoned[reason] ?? 0) + 1; };

  const settle = async (messageId: number, type: unknown): Promise<void> => {
    const config = deps.config();
    if (!config) return;
    const row = deps.rows()[messageId] as PolishRow | undefined;
    if (!row || rowIneligible(row, config.includeScripted && type === "command" ? "normal" : type, false)) return;
    const text = row.mes as string;
    const continued = typeof type === "string" && CONTINUED_TYPES.has(type);
    const prefix = continued ? seen.get(revisionOf(row)) ?? null : "";
    if (prefix === null || !text.startsWith(prefix)) { stats.skipped += 1; return; }
    stats.settled += 1;
    const run = deps.run();
    const candidate = deps.ledger.start(candidateKey(row, deps.chatId(), messageId, hash), 1, deps.now(), deps.holdMs());
    await deps.ready();
    await deps.sleep(Math.max(0, config.delayMs ?? 0));
    deps.ledger.observe({ kind: "tick", now: deps.now() });
    const current = deps.rows()[messageId] as PolishRow | undefined;
    const reason = writeMismatch(candidate, { row: current, sameObject: current === row, chatId: deps.chatId() }, hash, deps.now());
    deps.ledger.close(candidate);
    if (reason) { abandon(reason); return; }
    if (!run.stillOwns()) { abandon("chat-changed"); return; }
    const next = prefix + transform(text.slice(prefix.length), config);
    seen.set(revisionOf(row), next);
    if (next === text) { stats.unchanged += 1; return; }
    if (!deps.write(messageId, row, next).ok) { stats.failed += 1; return; }
    stats.written += 1;
    if (hasReasoning(row)) stats.carryHides += 1;
  };

  return { settle, stats };
}
