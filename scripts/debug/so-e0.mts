import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { buildPool, checkFrozen, freeze, loadE0, refusePublicPrivate, runE0 } from './lib/e0.mts';

const USAGE = `Usage:
  node scripts/debug/so-e0.mts sessions --sessions <root>
  node scripts/debug/so-e0.mts label-write --sessions <root> --out <dir> [--per 4] [--width 3] [--only T1/T1-1-1,...]
  node scripts/debug/so-e0.mts label-check --sessions <root> --out <dir> [--width 3]
  node scripts/debug/so-e0.mts label-merge --sessions <root> --out <dir>
  node scripts/debug/so-e0.mts pool --labels <labels.json> --sessions <root> --out <pool.json> [--provider stub|st-vectors]
  node scripts/debug/so-e0.mts choices --pool <pool.json> --out <calls.json>
  node scripts/debug/so-e0.mts freeze --labels <labels.json> --pool <pool.json> --out <freeze.json>
  node scripts/debug/so-e0.mts run --labels <labels.json> --pool <pool.json> --freeze <freeze.json> [--choices <calls.json>] [--out <result.json>]
  node scripts/debug/so-e0.mts golden --labels <labels.json> --pool <pool.json> --freeze <freeze.json> --choices <calls.json> --out <golden.json>

v2.8 plan 21 E0: ranking within the retrieved set.
sessions     lists the session chats under <root>/T*/T*-*/ the private set may use (40+ spoken messages; a copy sharing
             over half its text with a longer kept chat is dropped). Counts and session ids only.
label-write  one Sol call per kept session (opencode run --standalone, openai/gpt-6.1-sol, tools off) writes --per
             questions with an asking turn and gold ids into <dir>/written/. Resumes: a written session is skipped.
label-check  one blind claude -p call per written session (tools off, the owner's login) finds each question's answer
             ids without seeing the gold, into <dir>/checked/. Resumes.
label-merge  applies the rules in src/memory/e0Labels.ts and writes <dir>/labels.json (so-e0-labels/1, private) and
             <dir>/labels-report.json (invalid, unchecked, agreed, disagreed). Disagreements stay with agreed:false,
             so the review rule drops and counts them.
pool         one 8-id candidate pool per labelled question (collection = messages before the asking turn minus the last
             5; query = the previous message + the question) plus band membership at 0.82/0.7/0.55/0.4.
             --provider st-vectors runs on the lane page the st-lanes env points at: /api/vector purge, insert and query
             with the transformers source, every query timed in the page; the collections are purged afterwards.
choices      arm d's recorder: four TypeSafe Choice calls per pooled question through the page's judge harness probe
             (storyOrchestratorJudge.probe -> judge plugin, the path every calibration measures through, never the
             per-use routing). Resumes; a busy refusal waits and retries; a cache hit refuses.
freeze       hashes the labels and pool files (sha256) and every pooled question. Commit it before any arm runs.
run          ranks every pool with arms e, c, a, b, d (cost order) and scores hit@1, hit@4, MRR@4, pool recall, tie rate,
             calls, latency, input tokens and $ per question against the floors fixed in src/memory/e0Ranking.ts.
             Refuses an unfrozen pool.
golden       the public replay of a frozen run (so-e0-golden/1): message ids become pool slots (ST order), no text, no
             query, no question; bands, arm c's local scores, latencies and arm d's picks as slots, plus the run's
             result. src/memory/e0Golden.test.ts replays it in jest.
Private labels (source "private") write only under test/sessions/e0/ or outside this repo; output is counts and scores.`;

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
const readJson = async (file: string) => JSON.parse(await readFile(file, 'utf-8'));

async function onLanePage<T>(run: (page: import('playwright').Page) => Promise<T>): Promise<T> {
  const { withST } = await import('./lib/cli.mts');
  return withST(run);
}

async function stVectorsPool(labels: string, sessions: string) {
  const { createStVectorsProvider, embeddingModelOf, insertSummary, pageVectorPost } = await import('./lib/e0StVectors.mts');
  const { requireStRoot } = await import('../lib/stRoot.mjs');
  return onLanePage(async (page) => {
    const provider = createStVectorsProvider({ post: pageVectorPost(page as never), model: embeddingModelOf(requireStRoot()) });
    const warm = Array.from({ length: 8 }, (_, id) => ({ id, text: `warm-up line ${id}` }));
    const started = Date.now();
    await provider.query(warm, 'warm-up', 8, 0);
    const warmMs = Date.now() - started;
    try {
      const built = await buildPool(labels, sessions, provider);
      return { ...built, warmMs, inserts: insertSummary(provider.inserts().slice(1)) };
    } finally {
      await provider.purgeAll();
    }
  });
}

async function recordArmD(poolFile: string, out: string) {
  const { recordChoices, choiceSummary } = await import('./lib/e0Choices.mts');
  const kit = await loadE0() as unknown as Parameters<typeof recordChoices>[2];
  const pool = await readJson(poolFile) as { source: string; questions: Array<{ id: string; query: string; candidates: Array<{ messageId: number; text: string }> }> };
  refusePublicPrivate(pool.source, out);
  const done = existsSync(out) ? await readJson(out) : {};
  return onLanePage(async (page) => {
    const ask = (request: unknown) => page.evaluate(async (payload) => {
      const judge = (globalThis as unknown as { storyOrchestratorJudge?: { probe(request: unknown): Promise<unknown> } }).storyOrchestratorJudge;
      if (!judge) throw new Error('storyOrchestratorJudge not registered (extension not loaded?)');
      return judge.probe(payload);
    }, request) as Promise<import('./lib/e0Choices.mts').JudgeAnswer>;
    const calls = await recordChoices(pool.questions, ask, kit, { done, save: (value) => write(out, value) });
    return choiceSummary(calls);
  });
}

async function labels(command: string, args: string[]): Promise<number> {
  const labelLib = await import('./lib/e0Label.mts');
  const root = need(args, '--sessions');
  const out = need(args, '--out');
  refusePublicPrivate('private', `${out}/labels.json`);
  if (command === 'label-write') {
    const only = option(args, '--only')?.split(',').filter(Boolean);
    const sessions = only ?? (await labelLib.selectSessions(root)).picked.kept;
    console.log(JSON.stringify(await labelLib.writeLabels({ root, out, sessions, per: Number(option(args, '--per') ?? 0) || undefined, width: Number(option(args, '--width') ?? 3) })));
    return 0;
  }
  if (command === 'label-check') {
    console.log(JSON.stringify(await labelLib.checkLabels({ root, out, width: Number(option(args, '--width') ?? 3) })));
    return 0;
  }
  const rules = (await loadE0() as unknown as { E0_LABEL_RULES: { writer: string; checker: string } }).E0_LABEL_RULES;
  const merged = await labelLib.mergeLabels({ root, out, writer: rules.writer, checker: rules.checker });
  await write(`${out}/labels.json`, merged.labels);
  await write(`${out}/labels-report.json`, { counts: merged.counts, invalid: merged.invalid, models: merged.models });
  console.log(JSON.stringify({ counts: merged.counts, invalidReasons: merged.invalid.map((entry) => entry.reason), models: merged.models }, null, 1));
  return 0;
}

export async function main(argv: string[]): Promise<number> {
  const [command, ...args] = argv;
  if (!command || command === '--help' || args.includes('--help')) {
    console.log(USAGE);
    return command ? 0 : 1;
  }
  if (command === 'sessions') {
    const { selectSessions } = await import('./lib/e0Label.mts');
    const { chats, picked } = await selectSessions(need(args, '--sessions'));
    console.log(JSON.stringify({ chats: chats.size, kept: picked.kept.length, short: picked.short.length, duplicate: picked.duplicate.length, sessions: picked.kept }, null, 1));
    return 0;
  }
  if (command.startsWith('label-')) return labels(command, args);
  if (command === 'pool') {
    const out = need(args, '--out');
    const provider = option(args, '--provider') ?? 'stub';
    const labelsFile = need(args, '--labels');
    const sessions = need(args, '--sessions');
    const lanePool = provider === 'st-vectors' ? await stVectorsPool(labelsFile, sessions) : null;
    const built = lanePool ?? await buildPool(labelsFile, sessions, provider as 'stub');
    refusePublicPrivate(built.pool.source, out);
    await write(out, built.pool);
    const lane = lanePool ? { warmMs: lanePool.warmMs, inserts: lanePool.inserts } : {};
    console.log(JSON.stringify({ source: built.pool.source, provider: built.pool.provider, labels: built.labels.questions.length, droppedDisagreed: built.labels.dropped.disagreed, droppedInvalid: built.labels.dropped.invalid.length, pooled: built.pool.questions.length, refused: built.pool.refused.length, ...lane }));
    return 0;
  }
  if (command === 'choices') {
    console.log(JSON.stringify(await recordArmD(need(args, '--pool'), need(args, '--out'))));
    return 0;
  }
  if (command === 'freeze') {
    const out = need(args, '--out');
    const record = await freeze(need(args, '--labels'), need(args, '--pool'));
    await write(out, record);
    console.log(JSON.stringify({ labels: record.labels, pool: record.pool, questions: record.questions }));
    return 0;
  }
  if (command === 'run') {
    const labelsFile = need(args, '--labels');
    const pool = need(args, '--pool');
    const refused = await checkFrozen(option(args, '--freeze'), labelsFile, pool);
    if (refused) {
      console.error(refused);
      return 3;
    }
    const result = await runE0(labelsFile, pool, option(args, '--choices'));
    const out = option(args, '--out');
    if (out) {
      refusePublicPrivate(result.source, out);
      await write(out, result);
    }
    console.log(JSON.stringify(result, null, 2));
    return result.verdict.status === 'winner' || result.verdict.status === 'no-winner' ? 0 : 2;
  }
  if (command === 'golden') {
    const labelsFile = need(args, '--labels');
    const pool = need(args, '--pool');
    const freezeFile = need(args, '--freeze');
    const refused = await checkFrozen(freezeFile, labelsFile, pool);
    if (refused) {
      console.error(refused);
      return 3;
    }
    const choices = need(args, '--choices');
    const result = await runE0(labelsFile, pool, choices);
    const e0 = await loadE0() as unknown as { e0GoldenFrom(questions: unknown[], recorded: unknown, provider: string, freeze: { labels: string; pool: string }): { questions: unknown[] } };
    const frozen = await readJson(freezeFile);
    const pooled = await readJson(pool);
    const golden = e0.e0GoldenFrom(pooled.questions, await readJson(choices), pooled.provider, { labels: frozen.labels, pool: frozen.pool });
    const { source: _source, ...publicResult } = result;
    await write(need(args, '--out'), { ...golden, result: publicResult });
    console.log(JSON.stringify({ questions: golden.questions.length, verdict: result.verdict }));
    return 0;
  }
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
