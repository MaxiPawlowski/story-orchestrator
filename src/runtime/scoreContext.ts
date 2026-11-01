import { EVIDENCE_WINDOW, QUERY_WINDOW, recencyWeights, type ScoreContext } from "@memory/index";
import type { InjectorHosts } from "./hostPorts";

export interface ScoreContextInput {
  boundary: number;
  rosterNames: string[];
  openArcs: string[];
  weights?: ScoreContext["weights"];
  query?: { cast: string[] } | null;
  useRecency?: boolean;
}

const spoken = (row: unknown): string | null => {
  const message = row as { mes?: unknown; is_system?: unknown } | null;
  return message && message.is_system !== true && typeof message.mes === "string" && message.mes.trim() ? message.mes : null;
};

const named = (text: string, names: readonly string[]): string[] => {
  const lowered = text.toLowerCase();
  return names.filter((name) => name.trim() && lowered.includes(name.trim().toLowerCase()));
};

export function windowQuery(rows: readonly unknown[], rosterNames: readonly string[], cast: readonly string[]): Pick<ScoreContext, "queryParts" | "turnEntities" | "evidence" | "normalise"> {
  const recent: Array<{ text: string; index: number }> = [];
  for (let index = rows.length - 1; index >= 0 && recent.length < EVIDENCE_WINDOW; index -= 1) {
    const text = spoken(rows[index]);
    if (text) recent.push({ text, index });
  }
  const window = recent.slice(0, QUERY_WINDOW).reverse();
  const weights = recencyWeights(window.length);
  const last = rows.length - 1;
  const entities = new Set([...window.flatMap((row) => named(row.text, rosterNames)), ...cast.filter((name) => name.trim())]);
  return {
    queryParts: window.map((row, index) => ({ text: row.text, weight: weights[index] })),
    turnEntities: [...entities],
    evidence: { rows: recent.map((row) => ({ text: row.text, age: last - row.index })), cast: [...rosterNames] },
    normalise: true,
  };
}

export function buildScoreContext(chatHost: InjectorHosts["chat"], input: ScoreContextInput): ScoreContext {
  const chat = chatHost.chatRows();
  const turnText = chatHost.lastMessageText();
  const base: ScoreContext = {
    boundary: input.boundary,
    lastMessageId: chat.length - 1,
    turnText,
    turnEntities: named(turnText, input.rosterNames),
    openArcs: input.openArcs,
    weights: input.weights,
    ...(input.useRecency ? { useRecency: true } : {}),
  };
  return input.query ? { ...base, ...windowQuery(chat, input.rosterNames, input.query.cast) } : base;
}

export const forMember = (context: ScoreContext, names: readonly string[]): ScoreContext =>
  (context.queryParts ? { ...context, turnEntities: [...new Set([...context.turnEntities, ...names])] } : context);
