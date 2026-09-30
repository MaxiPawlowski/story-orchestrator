import type { SharedReadAudit } from "@extraction/index";
import type { JudgeCallRecord } from "@judge/index";
import type { CuratorPassAudit } from "@stagecraft/index";
import type { TalkDecisionAudit } from "./types";
import type { ModelCallRecord } from "./modelCallLog";

export const MODEL_CALLS_SHOWN = 20;
export const ROUTE_NOT_RECORDED = "route not recorded";

export interface ModelCallRow {
  at: string;
  kind: "judge" | "llm";
  role: string;
  route: string | null;
  result: string;
  ms: number | null;
  tokens: number | null;
  messageId: number | null;
}

export interface ModelCallSources {
  judgeCalls: readonly JudgeCallRecord[];
  audits: readonly SharedReadAudit[];
  talkDecisions: readonly TalkDecisionAudit[];
  curatorPass: CuratorPassAudit | null;
  routed?: readonly ModelCallRecord[];
}

export const judgeRoute = (model: string | null): string | null => (model ? `judge:typesafe:${model}` : null);

const judgeRow = (call: JudgeCallRecord): ModelCallRow => ({
  at: call.at,
  kind: "judge",
  role: `judge:${call.use}`,
  route: judgeRoute(call.model),
  result: call.fallback ? `fallback (${call.fallback})` : call.cached ? "cached" : "ok",
  ms: call.latencyMs,
  tokens: call.inputTokens !== undefined || call.outputTokens !== undefined ? (call.inputTokens ?? 0) + (call.outputTokens ?? 0) : null,
  messageId: call.messageId >= 0 ? call.messageId : null,
});

const readRow = (audit: SharedReadAudit): ModelCallRow => ({
  at: audit.createdAt,
  kind: "llm",
  role: `read:${audit.reason}`,
  route: null,
  result: `${audit.acceptedDeltas.length} accepted, ${audit.rejected.length} rejected`,
  ms: null,
  tokens: null,
  messageId: audit.window.to,
});

const MODEL_SPEAKER_SOURCES = new Set<TalkDecisionAudit["source"]>(["director", "fallback"]);

const talkRow = (decision: TalkDecisionAudit): ModelCallRow => {
  const chosen = decision.chosenName ?? "silence";
  return {
    at: decision.at,
    kind: "llm",
    role: "director",
    route: null,
    result: decision.source === "fallback" ? `fallback (${chosen})` : chosen,
    ms: decision.latencyMs,
    tokens: null,
    messageId: decision.messageId,
  };
};

const curatorRow = (pass: CuratorPassAudit): ModelCallRow => ({
  at: pass.at,
  kind: "llm",
  role: `curator:${pass.reason}`,
  route: null,
  result: `${pass.proposed} proposed`,
  ms: null,
  tokens: null,
  messageId: null,
});

export function buildModelCalls(sources: ModelCallSources): ModelCallRow[] {
  const rows = [
    ...sources.judgeCalls.map(judgeRow),
    ...sources.audits.map(readRow),
    ...sources.talkDecisions.filter((decision) => MODEL_SPEAKER_SOURCES.has(decision.source)).map(talkRow),
    ...(sources.curatorPass ? [curatorRow(sources.curatorPass)] : []),
    ...(sources.routed ?? []).map((call): ModelCallRow => ({
      at: call.at, kind: "llm", role: `${call.role}:${call.pass}`, route: call.route, result: call.fallbackFrom ? `fallback from ${call.fallbackFrom}` : call.result,
      ms: call.ms, tokens: call.inputTokens !== undefined || call.outputTokens !== undefined ? (call.inputTokens ?? 0) + (call.outputTokens ?? 0) : null, messageId: null,
    })),
  ];
  return rows.sort((left, right) => Date.parse(right.at) - Date.parse(left.at)).slice(0, MODEL_CALLS_SHOWN);
}
