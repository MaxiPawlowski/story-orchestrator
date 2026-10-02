import { evaluateInST } from './evaluate.mts';

export const MEMORY_OPS = ['pin', 'unpin', 'lock', 'unlock', 'exclude', 'edit'] as const;
export type MemoryOp = (typeof MEMORY_OPS)[number];

export interface MemoryRow { id: string; tier: string; text: string; pinned: boolean; locked: boolean; foldedInto: string | null }

const MIN_ID_PREFIX = 8;

export function resolveMemoryRow(rows: MemoryRow[], ref: string): { row: MemoryRow } | { error: string } {
  const needle = ref.trim();
  if (!needle) return { error: 'name a memory row by its id (8+ characters) or by a piece of its text' };
  const byId = rows.find((row) => row.id === needle);
  if (byId) return { row: byId };
  const prefixed = needle.length >= MIN_ID_PREFIX ? rows.filter((row) => row.id.startsWith(needle)) : [];
  const lower = needle.toLowerCase();
  const matches = prefixed.length ? prefixed : rows.filter((row) => row.text.toLowerCase().includes(lower));
  if (matches.length === 1) return { row: matches[0] };
  if (!matches.length) return { error: `no live memory row matches "${needle}"` };
  return { error: `"${needle}" matches ${matches.length} rows; name one by id: ${matches.slice(0, 8).map((row) => `${row.id.slice(0, MIN_ID_PREFIX)} ${row.text.slice(0, 80)}`).join(' | ')}` };
}

export function memoryLanded(op: MemoryOp, after: MemoryRow | null, text?: string): boolean {
  if (op === 'exclude') return after === null;
  if (!after) return false;
  if (op === 'pin' || op === 'unpin') return after.pinned === (op === 'pin');
  if (op === 'lock' || op === 'unlock') return after.locked === (op === 'lock');
  return after.text === (text ?? '').trim();
}

const readRows = (page: any): Promise<MemoryRow[]> => evaluateInST(page, () => {
  const entries = (globalThis as any).storyOrchestratorRuntime?.getSnapshot?.()?.memory?.entries ?? [];
  return entries.filter((entry: any) => !entry.supersededBy).map((entry: any) => ({
    id: String(entry.id), tier: String(entry.tier), text: String(entry.text ?? ''), pinned: entry.pinned === true, locked: entry.locked === true, foldedInto: entry.foldedInto ?? null,
  }));
});

export async function runMemoryVerb(page: any, op: MemoryOp, ref: string, text?: string) {
  const at = new Date().toISOString();
  if (!(MEMORY_OPS as readonly string[]).includes(op)) return { kind: 'memory' as const, at, op, ref, ok: false, problems: [`unknown memory op ${op}: ${MEMORY_OPS.join(', ')}`] };
  if (op === 'edit' && !text?.trim()) return { kind: 'memory' as const, at, op, ref, ok: false, problems: ['edit needs the new text'] };
  const found = resolveMemoryRow(await readRows(page), ref);
  if ('error' in found) return { kind: 'memory' as const, at, op, ref, ok: false, problems: [found.error] };
  await evaluateInST(page, async (call: { op: MemoryOp; id: string; text?: string }) => {
    const runtime = (globalThis as any).storyOrchestratorRuntime;
    if (call.op === 'pin' || call.op === 'unpin') return runtime.setMemoryPinned(call.id, call.op === 'pin');
    if (call.op === 'lock' || call.op === 'unlock') return runtime.memoryActions.setMemoryLocked(call.id, call.op === 'lock');
    if (call.op === 'exclude') return runtime.excludeMemoryEntry(call.id);
    return runtime.editMemoryEntry(call.id, String(call.text ?? '').trim());
  }, { op, id: found.row.id, text });
  const after = (await readRows(page)).find((row) => row.id === found.row.id) ?? null;
  const ok = memoryLanded(op, after, text);
  return { kind: 'memory' as const, at, op, ref, id: found.row.id, before: found.row, after, ok, problems: ok ? [] : [`the ${op} did not land on ${found.row.id} (refused, or not saved)`] };
}
