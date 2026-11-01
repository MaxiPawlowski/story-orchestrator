import { isLive } from "@memory/provenance";
import { keptFrom, sharedTierView, withoutSecretLines, type HeldSecret } from "@memory/heldSecrets";
import type { MemoryEntry } from "@memory/types";

export const CORE_ITEMS_MAX = 6;
export const CORE_TOKENS_MAX = 120;
export const CORE_ITEM_CHARS_MAX = 160;
export const CORE_ROWS_MAX = 24;
export const CORE_VERSIONS_MAX = 40;
export const CORE_ROUTE_ROLE = "memory" as const;
export const CORE_KINDS = ["stance", "want", "belief"] as const;

export type CoreKind = (typeof CORE_KINDS)[number];

export interface CoreItem {
  kind: CoreKind;
  text: string;
  cites: string[];
}

export interface CoreBlock {
  memberId: string;
  items: CoreItem[];
}

export type CoreDelta =
  | { op: "keep" }
  | { op: "add"; kind: CoreKind; text: string; cites: string[] }
  | { op: "revise"; index: number; text: string; cites: string[] }
  | { op: "drop"; index: number };

export interface CoreRow {
  id: string;
  text: string;
}

export interface CoreView {
  memberId: string;
  names: string[];
  rows: CoreRow[];
}

export interface CoreViewInput {
  memberId: string;
  names: readonly string[];
  shared: readonly MemoryEntry[];
  privateRows: readonly CoreRow[];
  secrets: readonly HeldSecret[];
}

export const coreTokens = (text: string): number => Math.ceil(text.length / 4);

const memberNames = (names: readonly string[]) => names.map((name) => name.trim().toLowerCase()).filter(Boolean);

export function buildCoreView(input: CoreViewInput): CoreView {
  const names = memberNames(input.names);
  const live = input.shared.filter((entry) => isLive(entry) && !entry.supersededBy && !entry.evictedAt);
  const view = sharedTierView([...live], input.secrets, names);
  const shared = view.entries.filter((entry) => !view.withheld.has(entry.id)).map((entry) => ({ id: entry.id, text: entry.text }));
  const own = input.privateRows.flatMap((row) => {
    const text = withoutSecretLines(row.text, input.secrets, names).trim();
    return text ? [{ id: row.id, text }] : [];
  });
  return { memberId: input.memberId, names, rows: [...own, ...shared].slice(-CORE_ROWS_MAX) };
}

const CITES = /\[([^\]]*)\]\s*$/;

const parseCites = (body: string): { text: string; cites: string[] } => {
  const found = CITES.exec(body);
  const cites = found ? (found[1] ?? "").split(/[,\s]+/).map((id) => id.trim()).filter(Boolean) : [];
  return { text: (found ? body.slice(0, found.index) : body).trim().slice(0, CORE_ITEM_CHARS_MAX), cites };
};

export function parseCoreDeltas(reply: string): CoreDelta[] {
  const deltas: CoreDelta[] = [];
  for (const raw of reply.split("\n")) {
    const line = raw.replace(/^[-*\s]+/, "").trim();
    if (/^KEEP\b/i.test(line)) deltas.push({ op: "keep" });
    const add = /^ADD\s+(stance|want|belief)\s*:\s*(.+)$/i.exec(line);
    if (add) deltas.push({ op: "add", kind: (add[1] ?? "belief").toLowerCase() as CoreKind, ...parseCites(add[2] ?? "") });
    const revise = /^REVISE\s+(\d+)\s*:\s*(.+)$/i.exec(line);
    if (revise) deltas.push({ op: "revise", index: Number(revise[1]) - 1, ...parseCites(revise[2] ?? "") });
    const drop = /^DROP\s+(\d+)\b/i.exec(line);
    if (drop) deltas.push({ op: "drop", index: Number(drop[1]) - 1 });
  }
  return deltas;
}

export type DeltaRefusal = "no-cite" | "foreign-cite" | "secret" | "bad-index" | "full" | "empty";

export interface DeltaOutcome {
  block: CoreBlock;
  applied: CoreDelta[];
  refused: Array<{ delta: CoreDelta; reason: DeltaRefusal }>;
}

const blockTokens = (items: readonly CoreItem[]) => coreTokens(items.map((item) => item.text).join("\n"));

export function applyCoreDeltas(block: CoreBlock, deltas: readonly CoreDelta[], view: CoreView, secrets: readonly HeldSecret[]): DeltaOutcome {
  const allowed = new Set(view.rows.map((row) => row.id));
  const items: Array<CoreItem | null> = block.items.map((item) => ({ ...item, cites: [...item.cites] }));
  const applied: CoreDelta[] = [];
  const refused: DeltaOutcome["refused"] = [];
  const refuse = (delta: CoreDelta, reason: DeltaRefusal) => refused.push({ delta, reason });
  const textProblem = (text: string, cites: readonly string[]): DeltaRefusal | null => {
    if (!text) return "empty";
    if (!cites.length) return "no-cite";
    if (cites.some((id) => !allowed.has(id))) return "foreign-cite";
    return keptFrom(text, secrets, view.names) ? "secret" : null;
  };
  for (const delta of deltas) {
    if (delta.op === "keep") continue;
    if (delta.op === "drop" || delta.op === "revise") {
      if (!Number.isInteger(delta.index) || !items[delta.index]) {
        refuse(delta, "bad-index");
        continue;
      }
    }
    if (delta.op === "drop") {
      items[delta.index] = null;
      applied.push(delta);
      continue;
    }
    const problem = textProblem(delta.text, delta.cites);
    if (problem) {
      refuse(delta, problem);
      continue;
    }
    if (delta.op === "revise") {
      const kept = items[delta.index] as CoreItem;
      const next = { ...kept, text: delta.text, cites: delta.cites };
      const trial = items.map((item, index) => (index === delta.index ? next : item)).filter((item): item is CoreItem => item !== null);
      if (blockTokens(trial) > CORE_TOKENS_MAX) refuse(delta, "full");
      else {
        items[delta.index] = next;
        applied.push(delta);
      }
      continue;
    }
    const present = items.filter((item): item is CoreItem => item !== null);
    const next = { kind: delta.kind, text: delta.text, cites: delta.cites };
    if (present.length >= CORE_ITEMS_MAX || blockTokens([...present, next]) > CORE_TOKENS_MAX) {
      refuse(delta, "full");
      continue;
    }
    items.push(next);
    applied.push(delta);
  }
  return { block: { memberId: block.memberId, items: items.filter((item): item is CoreItem => item !== null) }, applied, refused };
}

export interface CoreVersion {
  messageId: number;
  boundary: number;
  block: CoreBlock;
  inputs: string[];
}

export interface CoreStore {
  versions: Record<string, CoreVersion[]>;
}

export const emptyCoreStore = (): CoreStore => ({ versions: {} });

export const currentCore = (store: CoreStore, memberId: string): CoreBlock =>
  store.versions[memberId]?.at(-1)?.block ?? { memberId, items: [] };

export const recordCore = (store: CoreStore, version: CoreVersion): CoreStore => {
  const kept = (store.versions[version.block.memberId] ?? []).filter((entry) => entry.messageId < version.messageId);
  return { versions: { ...store.versions, [version.block.memberId]: [...kept, version].slice(-CORE_VERSIONS_MAX) } };
};

export const rollbackCore = (store: CoreStore, messageId: number): CoreStore => {
  if (!Number.isFinite(messageId)) return store;
  const versions: CoreStore["versions"] = {};
  for (const [memberId, list] of Object.entries(store.versions)) {
    const kept = list.filter((entry) => entry.messageId < messageId);
    if (kept.length) versions[memberId] = kept;
  }
  return { versions };
};

export const CORE_PROMPT_HEAD = "You keep one character's core notes: at most 6 short items about their stance toward others, what they want now, and what they believe happened that matters. "
  + "Answer only with delta lines, one per line: KEEP, ADD <stance|want|belief>: <text> [row ids], REVISE <n>: <text> [row ids], DROP <n>. "
  + "Every ADD and REVISE must cite at least one row id from the list below. Use only what the rows say.";

export function coreUpdatePrompt(name: string, block: CoreBlock, view: CoreView): { role: typeof CORE_ROUTE_ROLE; prompt: string } {
  const current = block.items.length ? block.items.map((item, index) => `${index + 1}. (${item.kind}) ${item.text} [${item.cites.join(", ")}]`).join("\n") : "(none yet)";
  const rows = view.rows.map((row) => `[${row.id}] ${row.text}`).join("\n");
  return { role: CORE_ROUTE_ROLE, prompt: `${CORE_PROMPT_HEAD}\n\nCharacter: ${name}\n\nCurrent notes:\n${current}\n\nRows this character knows:\n${rows || "(none)"}` };
}

export function renderCoreBlock(name: string, block: CoreBlock, secrets: readonly HeldSecret[], names: readonly string[]): string {
  if (!block.items.length) return "";
  const lines = block.items.map((item) => `- ${item.text}`).join("\n");
  const shown = withoutSecretLines(lines, secrets, memberNames(names)).trim();
  return shown ? `${name}'s own view:\n${shown}` : "";
}

export interface CoreUpdate {
  messageId: number;
  boundary: number;
  memberId: string;
  reply: string;
}

export function replayCore(updates: readonly CoreUpdate[], viewOf: (update: CoreUpdate) => CoreView, secrets: readonly HeldSecret[]): CoreStore {
  let store = emptyCoreStore();
  for (const update of updates) {
    const view = viewOf(update);
    const outcome = applyCoreDeltas(currentCore(store, update.memberId), parseCoreDeltas(update.reply), view, secrets);
    store = recordCore(store, { messageId: update.messageId, boundary: update.boundary, block: outcome.block, inputs: view.rows.map((row) => row.id) });
  }
  return store;
}
