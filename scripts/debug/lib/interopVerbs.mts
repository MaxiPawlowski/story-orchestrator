// v2.4 plan 01 (X4, X10): the interop verbs. Each drives the host the way ST itself or another
// extension would, so a fixture can reproduce a real host shape instead of a harness-only one.
import { evaluateInST } from './evaluate.mts';
import { saveSettingsNow } from './settingsSave.mts';
import { overSteerSpec, overSteerVerdict, type OverSteerReading, type OverSteerSpec } from './overSteer.mts';

type Page = Parameters<typeof evaluateInST>[0];

export async function hostDelete(page: Page, value: unknown) {
  const raw = typeof value === 'object' && value !== null ? (value as { messageId?: unknown }).messageId : value;
  return evaluateInST(page, async (rawId: unknown) => {
    const ctx = (globalThis as any).SillyTavern.getContext();
    const beforeLength = ctx.chat?.length ?? 0;
    const messageId = rawId === 'last' ? beforeLength - 1 : Number(rawId);
    if (!Number.isInteger(messageId) || messageId < 0 || messageId >= beforeLength) throw new Error(`host_delete: message ${messageId} not found (chat length ${beforeLength})`);
    const removed = { name: ctx.chat[messageId].name, mes: String(ctx.chat[messageId].mes ?? '').slice(0, 120) };
    await ctx.deleteMessage(messageId, undefined, false);
    return { messageId, beforeLength, afterLength: ctx.chat.length, removed };
  }, raw);
}

export const cutCommand = (range: unknown) => {
  const text = String(range ?? '').trim();
  if (!/^\d+(-\d+)?$/.test(text)) throw new Error(`cut: expected "a" or "a-b", got ${JSON.stringify(range)}`);
  return `/cut ${text}`;
};

export type GenerationEvent = { event: string; args?: unknown[] };

export function generationEvents(value: unknown): GenerationEvent[] {
  if (!Array.isArray(value) || !value.length) throw new Error('emit_generation: expected a non-empty list of {event, args}');
  return value.map((entry, index) => {
    const event = (entry as GenerationEvent)?.event;
    if (typeof event !== 'string' || !/^[A-Z_]+$/.test(event)) throw new Error(`emit_generation[${index}]: event must be an event_types KEY such as GENERATION_STARTED`);
    const args = (entry as GenerationEvent).args ?? [];
    if (!Array.isArray(args)) throw new Error(`emit_generation[${index}]: args must be a list`);
    return { event, args };
  });
}

export async function emitGeneration(page: Page, value: unknown) {
  const events = generationEvents(value);
  return evaluateInST(page, async (list: GenerationEvent[]) => {
    const ctx = (globalThis as any).SillyTavern.getContext();
    const emitted: string[] = [];
    for (const { event, args } of list) {
      const name = ctx.eventTypes[event];
      if (!name) throw new Error(`emit_generation: ST has no event_types.${event}`);
      await ctx.eventSource.emit(name, ...(args ?? []));
      emitted.push(event);
    }
    return { emitted };
  }, events);
}

export type ExtSetting = { extension: string; key: string; value: unknown };
type Restore = ExtSetting & { existed: boolean };

const pendingRestores: Restore[] = [];

export function extSettingSpec(value: unknown): ExtSetting {
  const spec = value as ExtSetting;
  if (!spec || typeof spec.extension !== 'string' || !spec.extension || typeof spec.key !== 'string' || !spec.key || !('value' in spec)) {
    throw new Error('ext_setting: expected {extension, key, value}');
  }
  return { extension: spec.extension, key: spec.key, value: spec.value };
}

export async function applyExtSetting(page: Page, value: unknown) {
  const spec = extSettingSpec(value);
  const before = await evaluateInST(page, ({ extension, key, next }: { extension: string; key: string; next: unknown }) => {
    const settings = (globalThis as any).SillyTavern.getContext().extensionSettings;
    const holder = settings[extension] ?? (settings[extension] = {});
    const existed = Object.prototype.hasOwnProperty.call(holder, key);
    const previous = holder[key];
    holder[key] = next;
    return { existed, previous };
  }, { extension: spec.extension, key: spec.key, next: spec.value });
  if (!pendingRestores.some((entry) => entry.extension === spec.extension && entry.key === spec.key)) {
    pendingRestores.push({ extension: spec.extension, key: spec.key, value: before.previous, existed: before.existed });
  }
  const saved = await saveSettingsNow(page);
  return { ...spec, previous: before.previous, saved };
}

/** Put every ext_setting back, newest first, and read each one back. The runners call this in `finally`. */
export async function restoreExtSettings(page: Page) {
  const restores = pendingRestores.splice(0).reverse();
  if (!restores.length) return { restored: [] as unknown[] };
  const readBack = await evaluateInST(page, (list: Restore[]) => {
    const settings = (globalThis as any).SillyTavern.getContext().extensionSettings;
    return list.map(({ extension, key, value, existed }) => {
      const holder = settings[extension] ?? (settings[extension] = {});
      if (existed) holder[key] = value; else delete holder[key];
      return { extension, key, value: holder[key], existed: Object.prototype.hasOwnProperty.call(holder, key) };
    });
  }, restores);
  const saved = await saveSettingsNow(page);
  const drift = readBack.filter((entry, index) => entry.existed !== restores[index].existed || JSON.stringify(entry.value) !== JSON.stringify(restores[index].value));
  return { restored: readBack, saved, ok: drift.length === 0, drift };
}

export const pendingExtSettingRestores = () => pendingRestores.length;

export type RecordedState = {
  engine: { values: Record<string, unknown>; versions: Record<string, unknown>; active: string; path: string[]; boundary: number };
  rows: { memory: string[]; epistemic: string[]; ledger: string[] };
};

export const STATE_SCOPES = ['values', 'versions', 'active', 'path', 'boundary', 'memory', 'epistemic', 'ledger'] as const;

export async function readRecordableState(page: Page): Promise<RecordedState> {
  return evaluateInST(page, () => {
    const rt = (globalThis as any).storyOrchestratorRuntime;
    const state = rt.getEngineState();
    if (!state) throw new Error('record_state: no story is loaded');
    const live = (row: any) => !row.supersededBy && (!row.provenance || row.provenance.validity === 'live');
    const snapshot = rt.getSnapshot();
    return {
      engine: { values: state.blackboard.values, versions: state.blackboard.versions ?? {}, active: state.activeCheckpointId, path: state.visitedPath ?? [], boundary: state.boundary },
      rows: {
        memory: (snapshot.memory?.entries ?? []).filter(live).map((row: any) => row.id).sort(),
        epistemic: (rt.getEpistemic?.() ?? []).filter(live).map((row: any) => row.id).sort(),
        ledger: (rt.getLedger?.() ?? []).filter((row: any) => !row.bound && live(row)).map((row: any) => row.id ?? `${row.entity}:${row.field}`).sort(),
      },
    };
  });
}

/** The replay-equality comparison, pure: which scoped fields differ between two recordings. */
export function stateDifferences(recorded: RecordedState, now: RecordedState, scope: readonly string[] = STATE_SCOPES): string[] {
  const pick = (state: RecordedState, field: string): unknown => {
    if (field in state.engine) return (state.engine as Record<string, unknown>)[field];
    return (state.rows as Record<string, unknown>)[field];
  };
  const stable = (value: unknown): string => JSON.stringify(value, (_key, inner) => (inner && typeof inner === 'object' && !Array.isArray(inner) ? Object.fromEntries(Object.entries(inner).sort(([a], [b]) => a.localeCompare(b))) : inner));
  const unknown = scope.filter((field) => !(STATE_SCOPES as readonly string[]).includes(field));
  if (unknown.length) throw new Error(`stateEquals: unknown scope ${unknown.join(', ')} (known: ${STATE_SCOPES.join(', ')})`);
  return scope.filter((field) => stable(pick(recorded, field)) !== stable(pick(now, field))).map((field) => `${field}: recorded ${stable(pick(recorded, field)).slice(0, 200)} now ${stable(pick(now, field)).slice(0, 200)}`);
}

export async function recordState(page: Page, value: unknown) {
  const as = String((value as { as?: unknown })?.as ?? '');
  if (!as) throw new Error('record_state: expected {as: "<name>"}');
  const state = await readRecordableState(page);
  await evaluateInST(page, ({ name, recorded }: { name: string; recorded: RecordedState }) => {
    const holder = ((globalThis as any).__soRecordedStates ??= {});
    holder[name] = recorded;
  }, { name: as, recorded: state });
  return { as, boundary: state.engine.boundary, active: state.engine.active, rows: { memory: state.rows.memory.length, epistemic: state.rows.epistemic.length, ledger: state.rows.ledger.length } };
}

export async function expectStateEquals(page: Page, value: unknown) {
  const spec = value as { as?: string; scope?: string[] };
  if (!spec?.as) throw new Error('expect.stateEquals: expected {as, scope?}');
  const recorded = await evaluateInST(page, (name: string) => ((globalThis as any).__soRecordedStates ?? {})[name] ?? null, spec.as);
  if (!recorded) throw new Error(`expect.stateEquals: nothing was recorded as "${spec.as}" (record_state first; a reload clears recordings)`);
  const differences = stateDifferences(recorded, await readRecordableState(page), spec.scope ?? STATE_SCOPES);
  if (differences.length) throw new Error(`state differs from "${spec.as}": ${differences.join(' | ')}`);
  return { as: spec.as, equal: true, scope: spec.scope ?? STATE_SCOPES };
}

/** The over-steer probe's page half: the block as the last capture carried it (else as the next prompt holds it) and reply N+1. */
export async function readOverSteer(page: Page, spec: OverSteerSpec): Promise<OverSteerReading> {
  const global = typeof spec.controlRun === 'object' ? spec.controlRun.global : null;
  const reading = await evaluateInST(page, ({ key, global }: { key: string; global: string | null }) => {
    const ctx = (globalThis as any).SillyTavern.getContext();
    const captures: any[] = (globalThis as any).storyOrchestratorRuntime?.getPayloadCaptures?.() ?? [];
    const carried = [...captures].reverse().map((capture) => (capture?.blocks ?? []).find((block: any) => block?.key === key)).find(Boolean);
    const replies = (ctx.chat ?? []).filter((message: any) => !message?.is_user && !message?.is_system);
    const control = global ? (globalThis as any)[global] : null;
    return {
      captured: typeof carried?.value === 'string' ? carried.value : null,
      current: typeof ctx.extensionPrompts?.[key]?.value === 'string' ? ctx.extensionPrompts[key].value : null,
      reply: typeof replies.at(-1)?.mes === 'string' ? replies.at(-1).mes : null,
      control: typeof control === 'string' ? control : null,
    };
  }, { key: spec.block, global });
  return typeof spec.controlRun === 'string' ? { ...reading, control: spec.controlRun } : reading;
}

export async function expectOverSteer(page: Page, value: unknown) {
  const spec = overSteerSpec(value);
  const verdict = overSteerVerdict(spec, await readOverSteer(page, spec));
  if (!verdict.ok) throw new Error(verdict.failures.join('; '));
  return verdict;
}

/** Evaluate a test-only script file in the page (the foreign-emitter fixture). Never installs anything. */
export async function injectScript(page: Page, file: string, scenarioDir: string) {
  const { readFile } = await import('node:fs/promises');
  const { resolve } = await import('node:path');
  const path = resolve(scenarioDir, file);
  const source = await readFile(path, 'utf-8');
  const result = await evaluateInST(page, (code: string) => new Function(`return ${code}`)(), source.replace(/^\s*\/\/.*$/gm, '').trim().replace(/;$/, ''));
  return { file: path, result };
}
