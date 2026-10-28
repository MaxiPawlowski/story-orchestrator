import type { parseSharedReadResponse } from "./parse";

export interface LiveReadTiers {
  facts: Array<{ text: string; importance: number }>;
  factLines: Array<{ text: string; importance: number }>;
  rejected: Array<{ line: string; reason: string }>;
  memory: Array<{ tier: string; text: string }>;
  arcs: Array<{ kind: string; text: string }>;
  epistemic: Array<{ tag: string; subject: string; hiddenFrom?: string; content: string }>;
  ledger: Array<{ entity: string; entityType: string; field: string; value: string }>;
}

const factRow = (entry: { text: string; importance: number }) => ({ text: entry.text, importance: entry.importance });

export const liveReadTiers = (parsed: ReturnType<typeof parseSharedReadResponse>): LiveReadTiers => ({
  facts: [...parsed.facts, ...parsed.memory.filter((entry) => entry.tier === "facts")].map(factRow),
  factLines: parsed.facts.map(factRow),
  rejected: parsed.rejected,
  memory: parsed.memory.map((entry) => ({ tier: entry.tier, text: entry.text })),
  arcs: parsed.arcs.map((entry) => ({ kind: entry.kind, text: entry.text })),
  epistemic: parsed.epistemic.map((entry) => ({ tag: entry.tag, subject: entry.subject, ...(entry.hiddenFrom ? { hiddenFrom: entry.hiddenFrom } : {}), content: entry.content })),
  ledger: parsed.ledger.map((entry) => ({ entity: entry.entity, entityType: entry.entityType, field: entry.field, value: entry.value })),
});
