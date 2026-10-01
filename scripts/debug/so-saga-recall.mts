import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Page } from 'playwright';
import { PROJECT_ROOT } from './lib/connection.mts';
import { hasHelpFlag, runCli } from './lib/cli.mts';
import { buildSagaCorpus, chapterlessStory, checkSagaCorpus, corpusJson, VARIANTS, type SagaNeedles, type SagaStory, type SagaTranscript, type SagaVariant } from './lib/sagaCorpus.mts';
import {
  assertFrozen, BASELINE_ARMS, checkBaseline, evaluateFloors, findArm, freezeManifest, loadArmRun, pageHost, RECIPE_PATH, RUN_FILES, RUNS_DIR, runAsk, runReplay,
  type ArmRun, type ReplayRecord, type SagaManifest, type SagaRecipe,
} from './lib/sagaRecall.mts';

const USAGE = `Usage: node scripts/debug/so-saga-recall.mts <command> [options]

v2.6 plan 07 Q-M recall driver over test/measurements/v2.6-07 (recipe.json, saga-mini*).

  corpus [--check]                      regenerate the deterministic corpus (both variants), or only check it
  prepare --arm <A1|A2|A2R|E1> [--tokens n] [--out dir] [--force]
                                        freeze a treatment arm: manifest.json with the sha256 of story, transcript,
                                        needles and recipe; later steps refuse when any of them changed
  baseline [--variant chaptered|chapterless] [--narrator name] [--out dir] [--force]
                                        A0 (or E0) on its own: freeze, force seal/chronicle/fold off + read back,
                                        replay and ask in the open fresh group chat (page)
  replay --run <dir> [--narrator name]  import the story, force the arm's settings, replay the transcript (page)
  ask --run <dir> [--narrator name]     ask the 30 questions as the player at c11, one at a time (page)
  score --run <dir> [--baseline <dir>]  regex scoring; a treatment arm needs its baseline (same frozen corpus)
  floors --runs A0=<dir>,A1=<dir>,...   Q-M1/Q-M4/Q-M5/Q-M8 from the recipe's predeclared checks

  --narrator defaults to "DM Narrator" (the group member that speaks the narrator lines and answers).
  Default run dir: ${RUNS_DIR}/<arm>[-t<tokens>].`;

const read = (path: string) => readFileSync(join(PROJECT_ROOT, path), 'utf8');
const readJson = <T,>(path: string): T => JSON.parse(read(path));
const write = (path: string, value: unknown) => {
  mkdirSync(dirname(join(PROJECT_ROOT, path)), { recursive: true });
  writeFileSync(join(PROJECT_ROOT, path), corpusJson(value));
};
const arg = (name: string, fallback: string | null = null) => {
  const index = process.argv.indexOf(name);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
};
const rel = (path: string) => relative(PROJECT_ROOT, join(PROJECT_ROOT, path)).replace(/\\/g, '/');

function corpus(check: boolean) {
  const story = readJson<SagaStory>(VARIANTS.chaptered.story);
  const problems: string[] = [];
  for (const variant of ['chaptered', 'chapterless'] as SagaVariant[]) {
    const built = buildSagaCorpus(variant);
    const variantStory = variant === 'chaptered' ? story : chapterlessStory(story);
    const files: Array<[string, unknown]> = [[VARIANTS[variant].transcript, built.transcript], [VARIANTS[variant].needles, built.needles]];
    if (variant === 'chapterless') files.push([VARIANTS[variant].story, variantStory]);
    problems.push(...checkSagaCorpus(variantStory, built.transcript, built.needles, variant).map((problem) => `${variant}: ${problem}`));
    for (const [path, value] of files) {
      if (!check) { write(path, value); continue; }
      const current = existsSync(join(PROJECT_ROOT, path)) ? read(path).replace(/\r\n/g, '\n') : null;
      if (current !== corpusJson(value)) problems.push(`${path} differs from the generator (run corpus without --check)`);
    }
  }
  for (const problem of problems) console.log(`FAIL ${problem}`);
  console.log(problems.length ? `corpus: ${problems.length} problem(s)` : `corpus ${check ? 'checked' : 'written'}: 360 + 600 messages, 40 needles each`);
  return problems.length === 0;
}

const runDirFor = (arm: string, tokens: number | null) => arg('--out', `${RUNS_DIR}/${arm}${tokens === null ? '' : `-t${tokens}`}`)!;

function prepare(armId: string, baseline: boolean): string {
  const recipe = readJson<SagaRecipe>(RECIPE_PATH);
  const arm = findArm(recipe, armId);
  const tokensRaw = arg('--tokens');
  const tokens = tokensRaw === null ? null : Number(tokensRaw);
  if (tokens !== null && (!Number.isInteger(tokens) || tokens <= 0)) throw new Error(`--tokens ${tokensRaw} is not a positive integer`);
  const dir = runDirFor(arm.id, tokens);
  if (existsSync(join(PROJECT_ROOT, dir, RUN_FILES.manifest)) && !process.argv.includes('--force')) throw new Error(`${dir} is already frozen; pass --force to re-freeze it`);
  const manifest = freezeManifest({ arm, chronicleTokens: tokens, baseline, read });
  write(`${dir}/${RUN_FILES.manifest}`, manifest);
  console.log(`froze ${arm.id}${baseline ? ' (baseline)' : ''} in ${dir}: corpus ${manifest.corpusDigest.slice(0, 12)}`);
  return dir;
}

const loadFrozen = (dir: string, step: string) => {
  const manifest = readJson<SagaManifest>(`${dir}/${RUN_FILES.manifest}`);
  assertFrozen(manifest, read, step);
  return manifest;
};

async function replay(page: Page, dir: string) {
  const manifest = loadFrozen(dir, 'replay');
  const record = await runReplay(pageHost(page), {
    manifest,
    story: readJson<SagaStory>(manifest.files.story.path),
    transcript: readJson<SagaTranscript>(manifest.files.transcript.path),
    narrator: arg('--narrator', 'DM Narrator')!,
    onProgress: (done, total) => { if (done % 20 === 0 || done === total) console.log(`replay ${done}/${total}`); },
  });
  write(`${dir}/${RUN_FILES.replay}`, record);
  for (const line of record.drift) console.log(`DRIFT ${line}`);
  console.log(`replay ${record.ok ? 'ok' : 'NOT ok'}: final ${record.finalCheckpoint}, ${record.chapterRecords} chapter record(s), chat ${record.chat.chatId}`);
  return { ok: record.ok };
}

async function ask(page: Page, dir: string) {
  const manifest = loadFrozen(dir, 'ask');
  const record = await runAsk(pageHost(page), {
    manifest,
    replay: readJson<ReplayRecord>(`${dir}/${RUN_FILES.replay}`),
    needles: readJson<SagaNeedles>(manifest.files.needles.path),
    recipe: readJson<SagaRecipe>(manifest.files.recipe.path),
    narrator: arg('--narrator', 'DM Narrator')!,
  });
  write(`${dir}/${RUN_FILES.ask}`, record);
  console.log(`asked ${record.answers.length} question(s) at ${record.checkpoint} in ${record.chatId}`);
  return { ok: true };
}

function score(dir: string, baselineDir: string | null) {
  const run = loadArmRun(dir, read);
  const isBaseline = run.manifest.baseline;
  let baselineProblems: string[] = [];
  if (!isBaseline) {
    if (!baselineDir) throw new Error(`refusing score: ${run.manifest.arm.id} is a treatment arm; pass --baseline ${RUNS_DIR}/${BASELINE_ARMS[run.manifest.variant]}`);
    baselineProblems = checkBaseline(run, loadArmRun(baselineDir, read));
    if (baselineProblems.length) throw new Error(`refusing score: ${baselineProblems.join('; ')}`);
  }
  write(`${dir}/${RUN_FILES.score}`, { ...run.score, baseline: baselineDir ? rel(baselineDir) : null });
  console.log(JSON.stringify({ arm: run.score.arm, recall: run.score.recall, wrongRate: run.score.wrongRate, byChapter: run.score.byChapter, missing: run.score.missing }, null, 2));
  return run.score.missing.length === 0;
}

function floors(spec: string) {
  const runs: Record<string, ArmRun> = {};
  for (const part of spec.split(',').map((entry) => entry.trim()).filter(Boolean)) {
    const [arm, dir] = part.split('=');
    const run = loadArmRun(dir, read);
    if (run.manifest.arm.id !== arm) throw new Error(`${dir} holds arm ${run.manifest.arm.id}, not ${arm}`);
    runs[arm] = run;
  }
  for (const run of Object.values(runs)) {
    if (run.manifest.baseline) continue;
    const base = runs[BASELINE_ARMS[run.manifest.variant]];
    if (!base) continue;
    const problems = checkBaseline(run, base);
    if (problems.length) throw new Error(`refusing floors: ${run.manifest.arm.id} vs ${base.manifest.arm.id}: ${problems.join('; ')}`);
  }
  const recipe = readJson<SagaRecipe>(RECIPE_PATH);
  const results = evaluateFloors(recipe, runs);
  write(`${RUNS_DIR}/floors.json`, { evaluatedAt: new Date().toISOString(), runs: Object.fromEntries(Object.entries(runs).map(([arm, run]) => [arm, { corpusDigest: run.manifest.corpusDigest, recall: run.score.recall, wrongRate: run.score.wrongRate, byChapter: run.score.byChapter }])), floors: results });
  for (const result of results) console.log(`${result.evaluated ? (result.pass ? 'PASS' : 'FAIL') : 'n/a '} ${result.id} ${result.detail}`);
  return results.every((result) => !result.evaluated || result.pass);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const command = process.argv[2];
  if (!command || hasHelpFlag()) {
    console.log(USAGE);
    process.exit(hasHelpFlag() ? 0 : 1);
  }
  const done = (ok: boolean) => { process.exitCode = ok ? 0 : 1; };
  const runDir = () => {
    const dir = arg('--run');
    if (!dir) throw new Error(`${command} needs --run <dir>`);
    return dir;
  };
  try {
    if (command === 'corpus') done(corpus(process.argv.includes('--check')));
    else if (command === 'prepare') {
      const armId = arg('--arm');
      if (!armId) throw new Error('prepare needs --arm');
      prepare(armId, false);
    } else if (command === 'score') done(score(runDir(), arg('--baseline')));
    else if (command === 'floors') {
      const spec = arg('--runs');
      if (!spec) throw new Error('floors needs --runs A0=<dir>,A1=<dir>,...');
      done(floors(spec));
    } else if (command === 'replay') { const dir = runDir(); await runCli((page) => replay(page, dir)); }
    else if (command === 'ask') { const dir = runDir(); await runCli((page) => ask(page, dir)); }
    else if (command === 'baseline') {
      const variant = (arg('--variant', 'chaptered') as SagaVariant);
      if (!(variant in VARIANTS)) throw new Error(`unknown --variant ${variant}`);
      const dir = prepare(BASELINE_ARMS[variant], true);
      await runCli(async (page) => {
        const replayed = await replay(page, dir);
        if (!replayed.ok) return { ok: false };
        return ask(page, dir);
      });
    } else {
      console.log(USAGE);
      done(false);
    }
  } catch (err) {
    console.error(`Error: ${err instanceof Error ? err.message : String(err)}`);
    process.exitCode = 1;
  }
}
