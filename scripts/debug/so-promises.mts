import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  caseRecord, checkFreeze, freezeRecord, loadPromiseKit, offlineSeed, p1Reply, p1Spec, p2Reply, p2Spec, P47_DIR, PLUMBING_MODES, readJson, replayP1, replayP2,
  type LiveRead, type PlumbingMode, type PromiseReadSpec, type Story,
} from './lib/promiseRun.mts';
import { checkP1Set, checkP2Set, RECORDS_FORMAT, scoreP1, scoreP2, scoreP8, type CaseRecord, type P1Set, type P2Set, type P8Window, type Records } from './lib/promiseScore.mts';
import type { P6Set } from './lib/promiseDirector.mts';

const USAGE = `Usage:
  node scripts/debug/so-promises.mts check
  node scripts/debug/so-promises.mts freeze
  node scripts/debug/so-promises.mts run --set p1|p2 --out <dir> [--label <r1>] [--plumbing gold|greedy|paraphrase] [--only <id,...>] [--resume]
  node scripts/debug/so-promises.mts score --set p1|p2 --records <file> [--out <file>]
  node scripts/debug/so-promises.mts cost --out <file> [--set p1|p2|both] [--story <file>]
  node scripts/debug/so-promises.mts director prompts|run|rate|score --out <dir>

v2.8 plan 47 CL harness. Sets: test/measurements/v2.8/47-promises (synthetic, English, frozen sha256 in freeze.json over
LF-normalised bytes). P1 = >= 60 labelled promises + >= 60 non-promises, P2 = >= 30 labelled resolution events + controls.
check (offline): verifies the freeze, the labels against the set rules, and replays the shipped acceptor (parsePromiseLine +
applyPromiseLines through the readCase seam) over canned replies: gold (labelled lines), greedy (gold plus every bait line,
P2: the event line also pointed at every other open id), paraphrase (labelled lines with reworded quotes). Acceptor only, no model.
run (lane page): sends each case through the SHIPPED shared read on the read role
(storyOrchestratorLiveSuite.runPromiseRead: runSharedRead with the promise contract section, then the shipped acceptor);
--plumbing answers every read with a canned reply instead of the model (debugResponse, no model call) and is never a
measurement. Writes <out>/<set>-<label|plumbing>.records.json and .score.json; resumes with --resume. Exit 0 pass, 1 fail, 2 incomplete.
score: rescores a records file. Floors are informational: P1 precision >= 0.95, recall >= 0.70, NPC promise attributed 0,
wrong promisee 0; P1s byte-exact 100 %, paraphrased quotes refused 100 %; P2 agreement >= 0.85; P2w 0. Metrics unrounded.
cost (P8, joins 42 RB, no model call): the read prompt for every window with and without the promise contract section
(debugResponse NO_DELTA), each counted by storyOrchestratorLiveSuite.measureBudget on the read role; floor +<= 5 %.
director (P6): prompts renders 20 director prompts with the shipped renderDirectorPrompt and promiseHooks (one open public
promise each); run asks Sol (opencode openai/gpt-6.1-sol, never -fast, never DeepSeek) for each proposal and runs the shipped
narratesPlayer guard; rate asks claude -p whether each proposal narrates the player keeping, breaking or answering the promise;
score counts guard + rater hits (floor 0 of 20). All resume.`;

const option = (args: string[], name: string) => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
};

const need = (args: string[], name: string) => {
  const value = option(args, name);
  if (!value) throw new Error(`missing ${name}\n${USAGE}`);
  return value;
};

const EXIT = { pass: 0, fail: 1, incomplete: 2 } as const;

const writeJson = (file: string, value: unknown) => writeFile(file, `${JSON.stringify(value, null, 1)}\n`, 'utf-8');

async function loadSets(dir = P47_DIR) {
  return {
    story: await readJson<Story>(join(dir, 'story.json')),
    p1: await readJson<P1Set>(join(dir, 'p1-cases.json')),
    p2: await readJson<P2Set>(join(dir, 'p2-cases.json')),
    p6: await readJson<P6Set>(join(dir, 'p6-director.json')),
  };
}

const setOf = (args: string[]) => {
  const set = need(args, '--set');
  if (set !== 'p1' && set !== 'p2') throw new Error(`--set must be p1 or p2\n${USAGE}`);
  return set;
};

const plumbingOf = (args: string[]): PlumbingMode | null => {
  const mode = option(args, '--plumbing');
  if (mode === undefined) return args.includes('--plumbing') ? 'gold' : null;
  if (!(PLUMBING_MODES as readonly string[]).includes(mode)) throw new Error(`--plumbing must be one of ${PLUMBING_MODES.join(', ')}`);
  return mode as PlumbingMode;
};

async function check() {
  const freeze = await checkFreeze();
  const { story, p1, p2, p6 } = await loadSets();
  const kit = await loadPromiseKit();
  const seeds = p2.cases.flatMap((entry) => offlineSeed(kit, story, p2, entry).refused.map((refused) => `${entry.id}: seed ${refused.key} refused (${refused.reason})`));
  const tally = (values: string[]) => values.reduce<Record<string, number>>((counts, value) => ({ ...counts, [value]: (counts[value] ?? 0) + 1 }), {});
  const acceptor = Object.fromEntries(PLUMBING_MODES.map((mode) => {
    const one = scoreP1(p1, replayP1(kit, story, p1, mode));
    const two = scoreP2(p2, replayP2(kit, story, p2, mode));
    return [mode, {
      p1: { precision: one.precision, recall: one.recall, npcAttributed: one.npcAttributed, wrongPromisee: one.wrongPromisee, p1sExact: one.p1sExact, p1sParaphraseRefused: one.p1sParaphraseRefused, conditionalStored: one.counts.conditionalStored, falsePositives: one.misses.filter((miss) => miss.kind === 'false-positive').map((miss) => miss.id) },
      p2: { agreement: two.agreement, p2w: two.p2w },
    }];
  }));
  const problems = [...freeze, ...checkP1Set(p1), ...checkP2Set(p2), ...seeds, ...(p6.cases.length === 20 ? [] : [`P6 has ${p6.cases.length} cases, not 20`])];
  const result = {
    plan: 'v2.8 47', freeze: freeze.length ? 'drift' : 'ok', problems,
    counts: {
      p1: { cases: p1.cases.length, promises: p1.cases.reduce((sum, entry) => sum + entry.gold.length, 0), nonPromiseCases: p1.cases.filter((entry) => entry.label === 'none').length, categories: tally(p1.cases.map((entry) => `${entry.label}:${entry.category}`)) },
      p2: { cases: p2.cases.length, events: p2.cases.filter((entry) => entry.event).length, kinds: tally(p2.cases.map((entry) => entry.category)) },
      p6: p6.cases.length,
    },
    acceptorOnly: acceptor,
  };
  console.log(JSON.stringify(result, null, 1));
  return problems.length ? 1 : 0;
}

type Evaluate = (spec: PromiseReadSpec) => Promise<LiveRead>;

async function runSet(args: string[]) {
  const set = setOf(args);
  const out = need(args, '--out');
  const plumbing = plumbingOf(args);
  const label = option(args, '--label') ?? plumbing ?? 'real';
  const only = option(args, '--only')?.split(',');
  const refused = await checkFreeze();
  if (refused.length) throw new Error(`refused: the frozen set drifted\n${refused.join('\n')}`);
  const { story, p1, p2 } = await loadSets();
  const kit = await loadPromiseKit();
  await mkdir(out, { recursive: true });
  const file = join(out, `${set}-${label}.records.json`);
  const records: Records & { freeze: Record<string, string>; startedAt: string; model?: unknown } = args.includes('--resume') && existsSync(file)
    ? JSON.parse(await readFile(file, 'utf-8'))
    : { format: RECORDS_FORMAT, set, arm: label, plumbing, synthetic: true, freeze: await freezeRecord(), startedAt: new Date().toISOString(), cases: [] };
  const done = new Set(records.cases.filter((entry) => entry.read).map((entry) => entry.id));
  records.cases = records.cases.filter((entry) => done.has(entry.id));
  const { withST } = await import('./lib/cli.mts');
  await withST(async (page) => {
    const evaluate: Evaluate = (spec) => page.evaluate(async (payload) => {
      const suite = (globalThis as unknown as { storyOrchestratorLiveSuite?: { runPromiseRead?(spec: unknown): Promise<unknown> } }).storyOrchestratorLiveSuite;
      if (!suite?.runPromiseRead) throw new Error('storyOrchestratorLiveSuite.runPromiseRead not registered (stale page or old build?)');
      return suite.runPromiseRead(payload);
    }, spec) as Promise<LiveRead>;
    const cases = (set === 'p1' ? p1.cases : p2.cases).filter((entry) => !done.has(entry.id) && (!only || only.includes(entry.id)));
    for (const entry of cases) {
      let record: CaseRecord;
      try {
        if (set === 'p1') {
          const p1Case = entry as P1Set['cases'][number];
          record = caseRecord(entry.id, await evaluate(p1Spec(story, p1, p1Case, plumbing ? p1Reply(story, p1Case, plumbing) : undefined)));
        } else {
          const p2Case = entry as P2Set['cases'][number];
          const seeded = offlineSeed(kit, story, p2, p2Case);
          record = caseRecord(entry.id, await evaluate(p2Spec(story, p2, p2Case, plumbing ? p2Reply(p2Case, seeded.ids, plumbing) : undefined)), seeded.ids);
        }
      } catch (error) {
        record = { id: entry.id, error: error instanceof Error ? error.message : String(error) };
      }
      records.cases.push(record);
      await writeJson(file, records);
      console.log(`${entry.id} ${record.error ? `ERROR ${record.error}` : `rows=${record.read?.rows.length ?? 0} events=${record.read?.events.length ?? 0}`}`);
    }
  });
  const score = set === 'p1' ? scoreP1(p1, records) : scoreP2(p2, records);
  const parity = records.cases.filter((entry) => (entry as { idParity?: boolean }).idParity === false).map((entry) => entry.id);
  const result = { ...score, records: file, ...(parity.length ? { idParityFailed: parity } : {}), measurement: plumbing ? 'plumbing (debugResponse, no model): never a measurement' : 'real read model' };
  await writeJson(join(out, `${set}-${label}.score.json`), result);
  console.log(JSON.stringify(result, null, 1));
  return EXIT[score.verdict as keyof typeof EXIT];
}

async function scoreFile(args: string[]) {
  const set = setOf(args);
  const records = await readJson<Records>(need(args, '--records'));
  if (records.format !== RECORDS_FORMAT) throw new Error(`records file is not ${RECORDS_FORMAT}`);
  const { p1, p2 } = await loadSets();
  const score = set === 'p1' ? scoreP1(p1, records) : scoreP2(p2, records);
  const out = option(args, '--out');
  if (out) await writeJson(out, score);
  console.log(JSON.stringify(score, null, 1));
  return EXIT[score.verdict as keyof typeof EXIT];
}

async function cost(args: string[]) {
  const out = need(args, '--out');
  const which = option(args, '--set') ?? 'both';
  const sets = await loadSets();
  const story = option(args, '--story') ? await readJson<Story>(option(args, '--story') as string) : sets.story;
  const specs: Array<{ id: string; spec: PromiseReadSpec }> = [
    ...(which === 'p2' ? [] : sets.p1.cases.map((entry) => ({ id: entry.id, spec: p1Spec(story, sets.p1, entry, 'NO_DELTA') }))),
    ...(which === 'p1' ? [] : sets.p2.cases.map((entry) => ({ id: entry.id, spec: p2Spec(story, sets.p2, entry, 'NO_DELTA') }))),
  ];
  const { withST } = await import('./lib/cli.mts');
  const measured = await withST(async (page) => {
    const rows: Array<P8Window & { profileId: string | null; contextLimit: unknown }> = [];
    for (const { id, spec } of specs) {
      rows.push({ id, ...await page.evaluate(async (payload) => {
        const suite = (globalThis as unknown as { storyOrchestratorLiveSuite?: { runPromiseRead?(spec: unknown): Promise<{ prompt: string }>; measureBudget(text: string, role?: string): Promise<{ estimate: number; profileId: string | null; contextLimit: unknown }> } }).storyOrchestratorLiveSuite;
        if (!suite?.runPromiseRead) throw new Error('storyOrchestratorLiveSuite.runPromiseRead not registered (stale page or old build?)');
        const on = await suite.runPromiseRead({ ...payload, promises: true });
        const off = await suite.runPromiseRead({ ...payload, promises: false });
        const [withSection, without] = [await suite.measureBudget(on.prompt, 'read'), await suite.measureBudget(off.prompt, 'read')];
        return { on: withSection.estimate, off: without.estimate, profileId: without.profileId, contextLimit: without.contextLimit };
      }, spec) });
    }
    return rows;
  });
  const result = { ...scoreP8(measured), story: option(args, '--story') ?? 'test/measurements/v2.8/47-promises/story.json', set: which, profileId: measured[0]?.profileId ?? null, contextLimit: measured[0]?.contextLimit ?? null, rows: measured, at: new Date().toISOString() };
  await writeJson(out, result);
  console.log(JSON.stringify({ ...result, rows: undefined }, null, 1));
  return result.pass === false ? 1 : 0;
}

async function director(args: string[]) {
  const [step] = args;
  const out = need(args, '--out');
  const lib = await import('./lib/promiseDirector.mts');
  const { p6 } = await loadSets();
  await mkdir(out, { recursive: true });
  if (step === 'prompts') console.log(JSON.stringify({ prompts: await lib.directorPrompts(await loadPromiseKit(), p6, out) }));
  else if (step === 'run') await lib.directorRun({ kit: await loadPromiseKit(), set: p6, out });
  else if (step === 'rate') await lib.directorRate({ set: p6, out });
  else if (step === 'score') {
    const score = await lib.directorScore(p6, out);
    await writeJson(join(out, 'p6.score.json'), score);
    console.log(JSON.stringify(score, null, 1));
    return EXIT[score.verdict as keyof typeof EXIT];
  } else throw new Error(`unknown director step ${step}\n${USAGE}`);
  return 0;
}

export async function main(argv: string[]): Promise<number> {
  const [command, ...args] = argv;
  if (!command || command === '--help' || args.includes('--help')) {
    console.log(USAGE);
    return command ? 0 : 1;
  }
  if (command === 'check') return check();
  if (command === 'freeze') {
    const sha256 = await freezeRecord();
    await writeJson(join(P47_DIR, 'freeze.json'), { plan: 'v2.8 47', hash: 'sha256 over LF-normalised UTF-8', sha256 });
    console.log(JSON.stringify(sha256, null, 1));
    return 0;
  }
  if (command === 'run') return runSet(args);
  if (command === 'score') return scoreFile(args);
  if (command === 'cost') return cost(args);
  if (command === 'director') return director(args);
  throw new Error(`unknown command ${command}\n${USAGE}`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  try {
    process.exitCode = await main(process.argv.slice(2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
