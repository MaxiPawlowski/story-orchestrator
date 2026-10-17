import { writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { refusePrivateOutput } from './lib/bundleEntry.mts';

const USAGE = `Usage:
  node scripts/debug/so-vr62.mts sessions --sessions <root>
  node scripts/debug/so-vr62.mts label-write --sessions <root> --out <dir> [--top-up] [--width 3]
  node scripts/debug/so-vr62.mts label-check --sessions <root> --out <dir> [--width 3]
  node scripts/debug/so-vr62.mts label-merge --sessions <root> --out <dir>
  node scripts/debug/so-vr62.mts pool --sessions <root> --labels <labels.json> --out <pool.json> [--provider stub|st-vectors]
  node scripts/debug/so-vr62.mts freeze --labels <labels.json> --pool <pool.json> --out <freeze.json>
  node scripts/debug/so-vr62.mts scenes --sessions <root> --labels <l> --pool <p> --freeze <f> --out <scenes.json>
  node scripts/debug/so-vr62.mts choices --labels <l> --pool <p> --freeze <f> --scenes <scenes.json> --out <calls.json>
  node scripts/debug/so-vr62.mts run --sessions <root> --labels <l> --pool <p> --freeze <f> --scenes <s> [--choices <c>] [--out <result.json>]

v2.8 plan 21 §6.2 (plan 43 R-Gate2), offline, R1 on the presence proxy, ranked by E0's winner (d). Declarations:
plan 21 §6.2 private run (2026-10-17).
sessions     E0's selector, then a held secret and 3+ non-player speakers. Counts and session ids only.
label-write  Sol (opencode, openai/gpt-6.1-sol, tools off) writes 3 positives + 3 exclusions per session (--top-up: 2 + 2
             into written-topup/). Resumes.
label-check  claude -p checks blind (no gold, no witnessed): answer ids and whether the member perceived them. Resumes.
label-merge  applies src/memory/vr62.ts rules, adds a private nonce per exclusion, writes labels.json and labels-report.json
             (counts and the fixture minimums).
pool         topK 32 per kept question over E0's collection and query (--provider st-vectors on the lane st-lanes env names).
freeze       sha256 of labels and pool. Commit the hashes before scenes, choices or run.
scenes       one judge scene read (tracker family) per pooled candidate message through storyOrchestratorJudge.probe. Resumes.
choices      arm d's four Choice calls for every question whose presence-filtered candidates exceed 4 (E0's recorder).
run          VR1, VR2, VR3, pool recall, presence keep/drop, the unfiltered diagnostic, cost; refuses an unfrozen pool.
Private output writes only under test/sessions/ or outside this repo.`;

const option = (args: string[], name: string) => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
};

const need = (args: string[], name: string) => {
  const value = option(args, name);
  if (!value) throw new Error(`missing ${name}\n${USAGE}`);
  return value;
};

const write = (file: string, value: unknown) => writeFile(file, `${JSON.stringify(value, null, 1)}\n`, 'utf-8');
const guard = (out: string) => refusePrivateOutput(false, out, 'vr62');

async function onLanePage<T>(run: (page: import('playwright').Page) => Promise<T>): Promise<T> {
  const { withST } = await import('./lib/cli.mts');
  return withST(run);
}

type Probe = (request: unknown) => Promise<{ answers: Record<string, unknown> | null; fallback?: string | null; model?: string | null; latencyMs: number; usage?: { input_tokens?: number }; cached?: boolean }>;

const pageProbe = (page: import('playwright').Page): Probe => (request) => page.evaluate(async (payload) => {
  const judge = (globalThis as unknown as { storyOrchestratorJudge?: { probe(request: unknown): Promise<unknown> } }).storyOrchestratorJudge;
  if (!judge) throw new Error('storyOrchestratorJudge not registered (extension not loaded?)');
  return judge.probe(payload);
}, request) as ReturnType<Probe>;

async function frozen(args: string[]) {
  const lib = await import('./lib/vr62.mts');
  const refused = await lib.checkFrozen(option(args, '--freeze'), need(args, '--labels'), need(args, '--pool'));
  if (refused) throw Object.assign(new Error(refused), { exit: 3 });
  return lib;
}

export async function main(argv: string[]): Promise<number> {
  const [command, ...args] = argv;
  if (!command || command === '--help' || args.includes('--help')) {
    console.log(USAGE);
    return command ? 0 : 1;
  }
  const lib = await import('./lib/vr62.mts');
  const width = Number(option(args, '--width') ?? 3);
  let result: unknown;
  if (command === 'sessions') {
    const { selectRealSessions } = await import('./lib/witreal.mts');
    const picked = await selectRealSessions(need(args, '--sessions'));
    result = { chats: picked.chats, e0Kept: picked.e0Kept, dropped: picked.dropped, kept: picked.sessions.length, sessions: picked.sessions.map((session) => session.session) };
  } else if (command === 'label-write') {
    guard(`${need(args, '--out')}/labels.json`);
    result = await lib.writeQuestions({ root: need(args, '--sessions'), out: need(args, '--out'), topUp: args.includes('--top-up'), width });
  } else if (command === 'label-check') {
    guard(`${need(args, '--out')}/labels.json`);
    result = await lib.checkQuestions({ root: need(args, '--sessions'), out: need(args, '--out'), width });
  } else if (command === 'label-merge') {
    guard(`${need(args, '--out')}/labels.json`);
    result = await lib.mergeQuestions({ root: need(args, '--sessions'), out: need(args, '--out') });
  } else if (command === 'pool') {
    const out = need(args, '--out');
    guard(out);
    const provider = option(args, '--provider') ?? 'stub';
    const build = async (vectors: unknown) => lib.buildPool(need(args, '--sessions'), need(args, '--labels'), vectors);
    if (provider === 'st-vectors') {
      const { createStVectorsProvider, embeddingModelOf, insertSummary, pageVectorPost } = await import('./lib/e0StVectors.mts');
      const { requireStRoot } = await import('../lib/stRoot.mjs');
      result = await onLanePage(async (page) => {
        const vectors = createStVectorsProvider({ post: pageVectorPost(page as never), model: embeddingModelOf(requireStRoot()), prefix: 'so-vr62' });
        const started = Date.now();
        await vectors.query(Array.from({ length: 8 }, (_, id) => ({ id, text: `warm-up line ${id}` })), 'warm-up', 8, 0);
        const warmMs = Date.now() - started;
        try {
          const built = await build(vectors);
          await write(out, built.pool);
          return { pooled: built.pool.questions.length, refused: built.pool.refused.length, provider: built.pool.provider, warmMs, inserts: insertSummary(vectors.inserts().slice(1)) };
        } finally {
          await vectors.purgeAll();
        }
      });
    } else {
      const { e0StubProvider } = await (await import('./lib/e0.mts')).loadE0() as unknown as { e0StubProvider: unknown };
      const built = await build(e0StubProvider);
      await write(out, built.pool);
      result = { pooled: built.pool.questions.length, refused: built.pool.refused.length, provider: built.pool.provider };
    }
  } else if (command === 'freeze') {
    const record = await lib.freeze(need(args, '--labels'), need(args, '--pool'));
    await write(need(args, '--out'), record);
    result = record;
  } else if (command === 'scenes') {
    const ready = await frozen(args);
    const out = need(args, '--out');
    guard(out);
    result = await onLanePage((page) => ready.recordScenes({ root: need(args, '--sessions'), poolFile: need(args, '--pool'), out, ask: pageProbe(page) }));
  } else if (command === 'choices') {
    const ready = await frozen(args);
    const out = need(args, '--out');
    guard(out);
    const { recordChoices, choiceSummary } = await import('./lib/e0Choices.mts');
    const { readJson } = await import('./lib/witreal.mts');
    const { kit, questions } = await ready.choiceInputs(need(args, '--pool'), need(args, '--scenes'));
    const done = existsSync(out) ? await readJson<Record<string, never[]>>(out) : {};
    result = await onLanePage(async (page) => {
      const calls = await recordChoices(questions, pageProbe(page) as never, kit as never, { done, save: (value) => write(out, value) });
      return { ...choiceSummary(calls), questionsNeedingCalls: questions.length };
    });
  } else if (command === 'run') {
    const ready = await frozen(args);
    const report = await ready.runVr62({ root: need(args, '--sessions'), labelsFile: need(args, '--labels'), poolFile: need(args, '--pool'), scenesFile: need(args, '--scenes'), choicesFile: option(args, '--choices') });
    const out = option(args, '--out');
    if (out) {
      guard(out);
      await write(out, report);
    }
    console.log(JSON.stringify(report, null, 1));
    return report.verdict.status === 'pass' || report.verdict.status === 'fail' ? 0 : 2;
  } else throw new Error(`unknown command ${command}\n${USAGE}`);
  console.log(JSON.stringify(result, null, 1));
  return 0;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  try {
    process.exitCode = await main(process.argv.slice(2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = (error as { exit?: number }).exit ?? 1;
  }
}
