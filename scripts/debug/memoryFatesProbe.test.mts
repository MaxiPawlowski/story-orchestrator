// AE-03: live-v24-08-fates-jump asserted "every row fated injected is in the memory blocks" through
// getMemoryInjectionBlocks(), a re-render from the store. The probe reads the extension prompt slots
// ST holds instead. Driven through the real inject_script path against a fake page.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { injectScript } from './lib/interopVerbs.mts';
import { validateFixture } from './lib/scenarioSchema.mts';

const ROOT = join(import.meta.dirname, '..', '..');
const SCENARIOS = join(ROOT, 'test', 'scenarios');
const FIXTURE = 'live-v24-08-fates-jump.json';
const page = { evaluate: async (fn: (arg: unknown) => unknown, arg: unknown) => fn(arg) };

type Row = { id: string; text: string };
type Probe = {
  appliedMemorySlots(prompts: unknown): Array<{ key: string; value: string }>;
  injectedFateFailures(input: { entries: Row[]; fates: Record<string, string>; extensionPrompts: unknown }): string[];
  check(): { failures: string[]; applied: string[] };
};

const rows: Row[] = [
  { id: 'm1', text: 'Ponticius posted the job on the guild board himself.' },
  { id: 'm2', text: 'Arin crossed the eastern pass alone once, years ago.' },
  { id: 'm3', text: 'The party agreed to gather in the yard.' },
];
const fates = { m1: 'injected', m2: 'injected', m3: 'over-budget' };
const facts = `- ${rows[0].text}\n- ${rows[1].text}`;

async function install(): Promise<Probe> {
  const outcome = await injectScript(page as never, '../fixtures/probes/memory-fates.js', SCENARIOS);
  assert.deepEqual(outcome.result, { installed: true });
  return (globalThis as Record<string, unknown>).__soFatesProbe as Probe;
}

function world(extensionPrompts: Record<string, unknown>) {
  const g = globalThis as Record<string, unknown>;
  g.SillyTavern = { getContext: () => ({ extensionPrompts }) };
  g.storyOrchestratorRuntime = {
    getSnapshot: () => ({ memory: { entries: rows }, memoryInjection: { fates } }),
    getMemoryInjectionBlocks: () => ({ facts, session_details: '', short_term: '', scene_history: '' }),
  };
}

test('passes when every row fated injected is in a memory slot ST holds, and an over-budget row may be absent', async () => {
  const probe = await install();
  world({ story_orchestrator_memory_facts: { value: facts, depth: 4 }, story_orchestrator_memory_short_term: { value: '' } });
  assert.deepEqual(probe.check(), { failures: [], applied: ['story_orchestrator_memory_facts'] });
});

test('negative control: the applied slot is missing while the fate still says injected, and the re-render would still have passed', async () => {
  const probe = await install();
  world({ story_orchestrator_epistemic: { value: facts }, '2_floating_prompt': { value: facts } });
  const recomputed = Object.values((globalThis as unknown as { storyOrchestratorRuntime: { getMemoryInjectionBlocks(): Record<string, string> } }).storyOrchestratorRuntime.getMemoryInjectionBlocks()).join('\n');
  assert.ok(rows.filter((row) => fates[row.id as keyof typeof fates] === 'injected').every((row) => recomputed.includes(row.text.slice(0, 40))), 'the re-rendered blocks hold both rows, so the old assertion passes here');
  const { failures, applied } = probe.check();
  assert.deepEqual(applied, []);
  assert.deepEqual(failures, [
    'm1 is fated injected but its text is not in the memory slots ST holds (applied: none)',
    'm2 is fated injected but its text is not in the memory slots ST holds (applied: none)',
  ]);
});

test('an emptied slot counts as not applied, and a slot holding one row does not vouch for the other', async () => {
  const probe = await install();
  assert.deepEqual(probe.injectedFateFailures({ entries: rows, fates, extensionPrompts: { story_orchestrator_memory_facts: { value: '   ' } } }).length, 2);
  assert.deepEqual(probe.injectedFateFailures({ entries: rows, fates, extensionPrompts: { story_orchestrator_memory_facts: { value: `- ${rows[0].text}` } } }), [
    'm2 is fated injected but its text is not in the memory slots ST holds (applied: story_orchestrator_memory_facts)',
  ]);
});

test('nothing fated injected is a failure, not a vacuous pass', async () => {
  const probe = await install();
  assert.deepEqual(probe.injectedFateFailures({ entries: rows, fates: { m3: 'over-budget' }, extensionPrompts: {} }), ['no row is fated injected, so the memory slots ST holds were checked against nothing']);
  assert.deepEqual(probe.injectedFateFailures({ entries: [{ id: 'm9', text: '  ' }], fates: { m9: 'injected' }, extensionPrompts: { story_orchestrator_memory_facts: { value: facts } } }), ['m9 is fated injected but has no text to look for']);
});

test('the fixture reads the applied slots through the probe, passes the closed vocabulary, and every eval parses', () => {
  const doc = JSON.parse(readFileSync(join(SCENARIOS, FIXTURE), 'utf-8'));
  assert.deepEqual(validateFixture(doc, FIXTURE), []);
  const evals: string[] = doc.steps.filter((step: { eval?: unknown }) => typeof step.eval === 'string').map((step: { eval: string }) => step.eval);
  for (const code of evals) new Function(`return (async () => { ${code} })()`);
  const check = evals.find((code) => code.includes('fated injected') || code.includes('__soFatesProbe'));
  assert.ok(check?.includes('__soFatesProbe.check') || check?.includes('probe.check()'));
  assert.ok(!evals.some((code) => code.includes('getMemoryInjectionBlocks')));
  const probeStep = doc.steps.findIndex((step: { inject_script?: string }) => step.inject_script === '../fixtures/probes/memory-fates.js');
  const checkStep = doc.steps.findIndex((step: { eval?: string }) => step.eval === check);
  assert.ok(probeStep >= 0 && probeStep < checkStep, 'the probe is injected before the step that uses it');
});
