import { appendAudit, BRIDGE, type AuditEntry } from "./htmlWidget";

let ring: AuditEntry[] = [];

export const readWidgetAudit = (): readonly AuditEntry[] => ring;

export const clearWidgetAudit = (): void => {
  ring = [];
};

export const journalWorthy = (entry: AuditEntry): boolean =>
  entry.outcome === "refused" || entry.method === BRIDGE.initialize || entry.method === BRIDGE.intent;

export const journalLine = (entry: AuditEntry): string => `Story-made panel ${entry.widgetId}: ${entry.method} ${entry.outcome}`;

export const recordWidgetAudit = (entry: AuditEntry, journal: (summary: string, detail: string) => void): void => {
  ring = appendAudit(ring, entry);
  if (journalWorthy(entry)) journal(journalLine(entry), entry.detail ?? "");
};

(globalThis as { storyOrchestratorWidgetBridge?: unknown }).storyOrchestratorWidgetBridge = { audit: readWidgetAudit, clear: clearWidgetAudit };
