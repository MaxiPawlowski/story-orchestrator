import { existsSync } from 'node:fs';
import { cp, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { loadEntry } from './bundleEntry.mts';
import { latestOk, type BatchItem, type BatchManifest, type Finish, type InstructSequences, type ResponseRecord, type StopCallback } from './promptBatch.mts';
import type { ItemKind } from './promptBatchRecorder.mts';
import type { LiveFixtureOutput } from './liveSuiteScore.mts';
import { lt06, saga, type CaptureContext, type CaptureResult } from './promptBatchScenarios.mts';

export interface KitReply { ok: boolean; text: string; finish: Finish; kind?: string; message?: string }

export interface BatchKit {
  readFinish(json: unknown): Finish;
  textCompletionReply(json: unknown, instruct: InstructSequences | null): KitReply;
  witnessReadStatus(spec: { story: unknown; state?: unknown; activeCheckpointId?: string }, text: string, finish: Finish, maxTokens: number | null): Promise<{ refused: string | null; rejected: number; witnessLines: number }>;
  fixtureLive(spec: { story: unknown; transcript: unknown; overrides?: Record<string, unknown> }, text: string): Promise<LiveFixtureOutput & Record<string, unknown> & { prompt: string }>;
}

export const loadBatchKit = () => loadEntry<BatchKit>('scripts/debug/lib/promptBatchEntry.ts');

export interface PlannedItem { id: string; kind: ItemKind; spec: unknown; canned: string; meta: Record<string, unknown> }

export type MeasureArgs = Record<string, string | boolean | undefined>;

export interface SelfCheck { ok: boolean; detail?: string }

export interface Measurement {
  id: string;
  synthetic: boolean;
  plan(args: MeasureArgs): Promise<PlannedItem[]>;
  keep(result: Record<string, unknown>): Record<string, unknown>;
  selfCheck(item: PlannedItem, inPage: Record<string, unknown>, calls: number, canned: string, kit: BatchKit, instruct: InstructSequences | null): Promise<SelfCheck>;
  outcome?(manifest: BatchManifest, item: BatchItem, record: ResponseRecord, kit: BatchKit): Promise<boolean | null>;
  score(dir: string, manifest: BatchManifest, records: ResponseRecord[], kit: BatchKit, args: MeasureArgs): Promise<{ ok: boolean | null; report: Record<string, unknown> }>;
  capture?(ctx: CaptureContext): Promise<CaptureResult>;
  roles?: string[];
  pinMemory?: boolean;
  stop?(dir: string, manifest: BatchManifest, kit: BatchKit): StopCallback;
}

export const CANNED_MODEL = 'prompt-batch-canned';

export const cannedBackendJson = (text: string): string => JSON.stringify({ content: text, stop: true, stopped_eos: true, stop_type: 'eos', tokens_predicted: 1, tokens_evaluated: 1, model: CANNED_MODEL });

const THOUGHT = '<|channel>thought\n<channel|>';

const canonical = (value: unknown): string => JSON.stringify(value ?? null);

const firstDiff = (pairs: Array<[string, unknown, unknown]>): string | undefined => pairs.find(([, left, right]) => canonical(left) !== canonical(right))?.[0];

const text = (args: MeasureArgs, name: string): string | undefined => (typeof args[name] === 'string' ? args[name] as string : undefined);

const need = (args: MeasureArgs, name: string): string => {
  const value = text(args, name);
  if (!value) throw new Error(`missing --${name}`);
  return value;
};

type WitnessArm = 'on' | 'off';

async function witnessSets(args: MeasureArgs) {
  const rec = await import('./witnessRecord.mts');
  const only = text(args, 'only')?.split(',');
  return (await rec.planAll(need(args, 'sessions'), text(args, 'lab-rows'), text(args, 'lab-story'))).filter((set) => !only || only.includes(set.key));
}

const armsOf = (args: MeasureArgs): WitnessArm[] => {
  const arm = text(args, 'arm') ?? 'both';
  if (arm === 'both') return ['on', 'off'];
  if (arm === 'on' || arm === 'off') return [arm];
  throw new Error(`--arm on|off|both, not ${arm}`);
};

const witnessStatus = (arm: WitnessArm, calls: number, reply: { ok: boolean } | null, refused: string | null): string => {
  if (arm === 'off') return 'off';
  if (calls === 0) return 'no-read';
  if (!reply?.ok || refused) return 'outage';
  return 'accepted';
};

export const w4: Measurement = {
  id: 'w4',
  synthetic: false,
  async plan(args) {
    const arms = armsOf(args);
    const items: PlannedItem[] = [];
    for (const set of await witnessSets(args)) {
      for (const read of set.reads) {
        for (const arm of arms) {
          items.push({
            id: `${arm}/${read.readId}`, kind: 'witness', canned: cannedBackendJson(`${THOUGHT}NO_DELTA`),
            spec: { story: set.story, chat: set.chat, from: read.from, to: read.to, state: read.state, present: arm === 'on' ? read.presentIds : null, ...(read.activeCheckpointId ? { activeCheckpointId: read.activeCheckpointId } : {}) },
            meta: { set: set.key, readId: read.readId, arm, from: read.from, to: read.to },
          });
        }
      }
    }
    return items;
  },
  keep: (result) => ({ rawResponse: result.rawResponse, status: result.status, scope: result.scope, calls: result.calls, inputTokens: result.inputTokens, window: result.window }),
  async selfCheck(item, inPage, calls, canned, kit, instruct) {
    const arm = item.meta.arm as WitnessArm;
    const expected = (inPage.status as string | null) ?? (arm === 'off' ? 'off' : 'outage');
    if (calls === 0) return expected === 'no-read' || arm === 'off' ? { ok: true } : { ok: false, detail: `no model call, but the page reported ${expected}` };
    const reply = kit.textCompletionReply(JSON.parse(canned), instruct);
    if (!reply.ok) return { ok: false, detail: `offline processing refused the canned reply: ${reply.message}` };
    const spec = item.spec as { story: unknown; state?: unknown; activeCheckpointId?: string };
    const maxTokens = ((inPage.calls as Array<{ maxTokens: number | null }> | undefined)?.[0]?.maxTokens) ?? null;
    const { refused } = await kit.witnessReadStatus(spec, reply.text, reply.finish, maxTokens);
    const status = witnessStatus(arm, calls, reply, refused);
    const differs = firstDiff([['rawResponse', reply.text, inPage.rawResponse], ['status', status, expected]]);
    return differs ? { ok: false, detail: `offline ${differs} differs from the page` } : { ok: true };
  },
  async score(dir, manifest, records, kit, args) {
    const rec = await import('./witnessRecord.mts');
    const { fileOf, writeJson } = await import('./witreal.mts');
    const sets = await witnessSets({ ...manifest.args, ...args });
    const ok = latestOk(records);
    const out = join(dir, 'witness');
    const byId = new Map(manifest.items.map((item) => [item.id, item]));
    const tally = { missing: [] as string[], retryOwed: [] as string[], outage: [] as string[], scored: 0 };
    const arms = new Set<WitnessArm>();
    for (const set of sets) {
      for (const arm of ['on', 'off'] as WitnessArm[]) {
        const rows: Array<Record<string, unknown>> = [];
        for (const read of set.reads) {
          const item = byId.get(`${arm}/${read.readId}`);
          if (!item) continue;
          arms.add(arm);
          const inPage = item.inPage ?? {};
          const present = arm === 'on' ? read.presentNames : null;
          const base = { readId: read.readId, arm, from: read.from, to: read.to, present, scope: inPage.scope ?? 0 };
          if (!item.sha) {
            rows.push({ ...base, status: witnessStatus(arm, 0, null, null), inputTokens: 0, outputTokens: 0, calls: [], response: inPage.rawResponse ?? 'NO_DELTA', rejected: 0, batch: { sha: null, meter: 'backend' } });
            continue;
          }
          const record = ok.get(item.id);
          if (!record) {
            tally.missing.push(item.id);
            continue;
          }
          const reply = kit.textCompletionReply(JSON.parse(record.raw), manifest.route.instruct);
          const maxTokens = ((inPage.calls as Array<{ maxTokens: number | null }> | undefined)?.[0]?.maxTokens) ?? null;
          const read2 = reply.ok ? await kit.witnessReadStatus({ story: set.story, state: read.state, ...(read.activeCheckpointId ? { activeCheckpointId: read.activeCheckpointId } : {}) }, reply.text, reply.finish, maxTokens) : null;
          const status = witnessStatus(arm, 1, reply, read2?.refused ?? null);
          if (read2?.refused) tally.retryOwed.push(item.id);
          if (status === 'outage') tally.outage.push(item.id);
          tally.scored += 1;
          const model = (() => { try { return (JSON.parse(record.raw) as { model?: string }).model ?? null; } catch { return null; } })();
          rows.push({
            ...base, status, inputTokens: record.tokens.prompt ?? 0, outputTokens: record.tokens.predicted ?? 0,
            calls: [{ finish: record.finish, ms: record.ms, maxTokens, model }], response: reply.ok ? reply.text : '', rejected: read2?.rejected ?? 0,
            batch: { sha: item.sha, meter: 'backend', ...(read2?.refused ? { retryOwed: read2.refused } : {}), ...(reply.ok ? {} : { error: reply.message }) },
          });
        }
        if (!rows.length) continue;
        await mkdir(join(out, 'reads', arm), { recursive: true });
        await writeJson(join(out, 'reads', arm, fileOf(set.key)), { key: set.key, arm, records: rows });
      }
    }
    const labelsFrom = text(args, 'labels-from');
    const adjudicated = args.adjudicated === true;
    const report: Record<string, unknown> = { measurement: 'w4', witnessOut: out, missing: tally.missing, retryOwed: tally.retryOwed, outage: tally.outage, scored: tally.scored };
    if (arms.has('on')) {
      await rec.writeReadsFiles(sets, out);
      if (labelsFrom) {
        for (const part of [['labels'], ['lab', 'labels.json'], ['adjudicated', 'labels'], ['adjudicated', 'lab.json']]) {
          const source = join(labelsFrom, ...part);
          if (existsSync(source)) await cp(source, join(out, ...part), { recursive: true });
        }
        const lib = await import('./witnessLabel.mts');
        const refused = await lib.checkWitnessFreeze(out, need(args, 'freeze'), adjudicated);
        if (refused) throw new Error(refused);
        report.scoreReal = await lib.scoreRealReads(out, adjudicated);
      }
    }
    if (arms.has('on') && arms.has('off')) report.wc = await rec.wcAll(out);
    const real = (report.scoreReal as { real?: { verdict?: string }; realNullControlBeaten?: boolean | null } | undefined);
    const verdict = real?.real?.verdict;
    return { ok: verdict === undefined || tally.missing.length ? null : verdict === 'pass' && real?.realNullControlBeaten !== false, report };
  },
};

const T8_KEYS = ['deltas', 'facts', 'rejected', 'memory', 'arcs', 'epistemic', 'ledger'] as const;

const cannedFixtureReply = (expected: Record<string, any>): string => {
  const deltas = (expected.deltas ?? []) as Array<{ q: string; v: unknown; evidence?: string }>;
  const lines = deltas.map((delta) => `DELTA q=${delta.q} value=${JSON.stringify(delta.v)} evidence=${JSON.stringify(delta.evidence ?? '')}`);
  return `${THOUGHT}${lines.length ? lines.join('\n') : 'NO_DELTA'}`;
};

async function timeFixtures(args: MeasureArgs) {
  const { discoverFixtures } = await import('./liveSuiteFixtures.mts');
  return discoverFixtures(text(args, 'filter'), 'time');
}

const fixtureSpec = (fixture: { story: unknown; transcript: unknown; expected: Record<string, any> }) => ({ story: fixture.story, transcript: fixture.transcript, ...(fixture.expected?.spec ?? {}) });

async function liveFor(kit: BatchKit, fixture: { story: unknown; transcript: unknown; expected: Record<string, any> }, textValue: string) {
  return kit.fixtureLive({ story: fixture.story, transcript: fixture.transcript, overrides: fixture.expected?.spec ?? {} }, textValue);
}

export const t8: Measurement = {
  id: 't8',
  synthetic: true,
  async plan(args) {
    return (await timeFixtures(args)).map((fixture) => ({ id: fixture.name, kind: 'fixture' as const, spec: fixtureSpec(fixture), canned: cannedBackendJson(cannedFixtureReply(fixture.expected)), meta: { name: fixture.name } }));
  },
  keep: (result) => ({ prompt: result.prompt, rawResponse: result.rawResponse, ...Object.fromEntries(T8_KEYS.map((key) => [key, result[key]])) }),
  async selfCheck(item, inPage, calls, canned, kit, instruct) {
    if (calls !== 1) return { ok: false, detail: `expected one model call, saw ${calls}` };
    const reply = kit.textCompletionReply(JSON.parse(canned), instruct);
    if (!reply.ok) return { ok: false, detail: `offline processing refused the canned reply: ${reply.message}` };
    const spec = item.spec as { story: unknown; transcript: unknown } & Record<string, unknown>;
    const { story, transcript, ...overrides } = spec;
    const live = await kit.fixtureLive({ story, transcript, overrides }, reply.text);
    const differs = firstDiff([['rawResponse', reply.text, inPage.rawResponse], ['prompt', live.prompt, inPage.prompt], ...T8_KEYS.map((key) => [key, live[key], inPage[key]] as [string, unknown, unknown])]);
    return differs ? { ok: false, detail: `offline ${differs} differs from the page` } : { ok: true };
  },
  async outcome(manifest, item, record, kit) {
    const fixture = (await timeFixtures({ filter: item.id })).find((entry) => entry.name === item.id);
    if (!fixture) return null;
    const reply = kit.textCompletionReply(JSON.parse(record.raw), manifest.route.instruct);
    if (!reply.ok) return false;
    const { scoreLiveFixture } = await import('./liveSuiteScore.mts');
    return scoreLiveFixture(fixture, await liveFor(kit, fixture, reply.text)).pass;
  },
  async score(_dir, manifest, records, kit, args) {
    const { DEFAULT_TIER_FLOORS, parseTierFloors, scoreLiveFixture, suiteVerdict, tierTotals } = await import('./liveSuiteScore.mts');
    const fixtures = await timeFixtures({ ...manifest.args, ...args });
    const ok = latestOk(records);
    const parsed = parseTierFloors(text(args, 'min-tier') ?? '', DEFAULT_TIER_FLOORS);
    if (parsed.errors.length) throw new Error(parsed.errors.join('; '));
    const min = Number(text(args, 'min') ?? '0.9');
    const results: Array<Record<string, any>> = [];
    for (const item of manifest.items) {
      const fixture = fixtures.find((entry) => entry.name === item.id);
      const record = ok.get(item.id);
      if (!fixture || !record) {
        results.push({ name: item.id, pass: false, error: fixture ? 'no response recorded' : 'fixture not found' });
        continue;
      }
      const reply = kit.textCompletionReply(JSON.parse(record.raw), manifest.route.instruct);
      if (!reply.ok) {
        results.push({ name: item.id, pass: false, error: reply.message, ms: record.ms });
        continue;
      }
      const live = await liveFor(kit, fixture, reply.text);
      const { pass, expectedNorm, liveNorm, tiers } = scoreLiveFixture(fixture, live);
      results.push({ name: item.id, pass, tiers, expected: expectedNorm, live: liveNorm, ms: record.ms, finish: record.finish, sha: item.sha });
    }
    const passed = results.filter((entry) => entry.pass).length;
    const accuracy = results.length ? passed / results.length : 0;
    const totals = tierTotals(results.map((entry) => ({ name: entry.name, pass: entry.pass, tiers: entry.tiers ?? [] })), parsed.floors);
    const incomplete = results.filter((entry) => entry.error).map((entry) => entry.name);
    const expectCount = text(args, 'expect-count') ? Number(text(args, 'expect-count')) : null;
    const verdict = suiteVerdict({ plotAccuracy: accuracy, min, totals, ran: results.length, expectCount, incomplete });
    return {
      ok: verdict.ok,
      report: { measurement: 't8', set: 'time', total: results.length, passed, plotDeltaAccuracy: Number(accuracy.toFixed(4)), min, tiers: totals, incomplete, notGreen: verdict.reasons, ok: verdict.ok, results },
    };
  },
};

export const MEASUREMENTS: Readonly<Record<string, Measurement>> = { w4, t8, lt06, saga };

export function measurementFor(id: string | undefined): Measurement {
  const found = id ? MEASUREMENTS[id] : undefined;
  if (!found) throw new Error(`--measurement ${Object.keys(MEASUREMENTS).join('|')}${id ? `, not ${id}` : ''}`);
  return found;
}
