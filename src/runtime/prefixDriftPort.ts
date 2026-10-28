import { isRecord } from "@utils/guards";
import { log } from "@utils/log";
import { withholds } from "./generationLifecycle";
import type { PrefixDrift, PrefixDriftBreak, PrefixDriftKeySummary, PrefixDriftKind, PrefixDriftRecord } from "./prefixDrift";

export interface PrefixDriftHandle {
  records: () => PrefixDriftRecord[];
  summary: () => PrefixDriftKeySummary[];
  clear: () => void;
}

const renderMessages = (messages: unknown[]): string => messages
  .map((message) => (isRecord(message) ? `### ${String(message.role ?? "?")}\n${typeof message.content === "string" ? message.content : JSON.stringify(message.content ?? null)}` : ""))
  .join("\n");

export const requestPromptText = (payload: Record<string, unknown>): string | null =>
  (typeof payload.prompt === "string" ? payload.prompt : Array.isArray(payload.messages) ? renderMessages(payload.messages) : null);

export const replyKey = (chatId: string | null, member: string | null, type: string | null): string =>
  `reply:${chatId ?? "none"}:${member ?? "resting"}${type && withholds(type) ? `:${type}` : ""}`;

export const reportBreak: PrefixDriftBreak = (record, first) => {
  const line = `prefix drift: ${record.key} diverged at char ${record.divergence}, ${record.lost} chars above the per-turn boundary (${record.source ?? "none"}, ${record.verdict})`;
  if (first) log.warn(line);
  else log.debug(line);
};

let unit: Promise<PrefixDrift> | null = null;
let loaded: PrefixDrift | null = null;

const load = (): Promise<PrefixDrift> => (unit ??= import("./prefixDrift").then(({ PrefixDrift: Unit }) => (loaded = new Unit(reportBreak))));

export const prefixDrift = {
  observe(key: string, kind: PrefixDriftKind, prompt: string): Promise<PrefixDriftRecord | null> {
    if (!prompt) return Promise.resolve(null);
    return load().then((drift) => drift.observe(key, kind, prompt), () => null);
  },
  handle(): PrefixDriftHandle {
    return { records: () => loaded?.records() ?? [], summary: () => loaded?.summary() ?? [], clear: () => loaded?.clear() };
  },
  reset(): void {
    loaded?.clear();
  },
};
