import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PROJECT_ROOT } from './lib/connection.mts';
import { evaluateInST } from './lib/evaluate.mts';
import { writeJSON } from './lib/output.mts';
import { runCli, hasHelpFlag } from './lib/cli.mts';
import { f3Verdict, scoreArm, sliceTotals, type ArmScore, type SceneExpected } from './lib/sceneArmsScore.mts';

const USAGE = `Usage: node scripts/debug/so-f3-arms.mts run [--dir <scene dir>] [--chunk-budget <tokens>] [--record <dir>]

v2.5 plan 05 F3 spike. Runs the epistemic + ledger pass prompts over each scene in
test/fixtures/f3-scene (or --dir) twice: arm A = the detecting window (today), arm B = the whole
scene (packed by the chunker when --chunk-budget is given). Scores recall per slice, precision
(1 - forbidden hits / signals) and prompt cost (chars; the estimate counter is chars/4, so the ratio
is the token ratio), and applies the predeclared floors. Uses the extraction profile; capture a run
header around it, and quote the numbers only for that route.`;

const argValue = (name: string, fallback: string) => {
  const index = process.argv.indexOf(name);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
};

interface Scene {
  name: string;
  slice: 'long' | 'short';
  lang: string;
  participants: string[];
  entities?: Array<{ name: string; type: string }>;
  sceneStart: number;
  detectFrom: number;
  to: number;
  transcript: Array<{ index: number; speaker: string; text: string }>;
  expected: SceneExpected;
}

export async function loadScenes(dir: string): Promise<Scene[]> {
  const files = (await readdir(dir)).filter((file) => file.endsWith('.scene.json')).sort();
  return Promise.all(files.map(async (file) => ({ name: file.replace('.scene.json', ''), ...JSON.parse(await readFile(join(dir, file), 'utf-8')) })));
}

async function runArms(page, { dir, chunkBudget, record }: { dir: string; chunkBudget: number | null; record: string | null }) {
  const scenes = await loadScenes(dir);
  if (!scenes.length) throw new Error(`No scenes in ${dir}`);
  const rows: Array<{ name: string; slice: string; lang: string; A: ArmScore; B: ArmScore; raw: Record<string, string[]> }> = [];
  for (const scene of scenes) {
    const spec = {
      messages: scene.transcript.map((entry) => ({ messageId: entry.index, speaker: entry.speaker, text: entry.text })),
      sceneStart: scene.sceneStart,
      detectFrom: scene.detectFrom,
      to: scene.to,
      participants: scene.participants,
      ...(scene.entities ? { entities: scene.entities } : {}),
    };
    const readings = {} as Record<'A' | 'B', { epistemic: never[]; ledger: never[]; promptChars: number; raw: string[] }>;
    for (const arm of ['A', 'B'] as const) {
      readings[arm] = await evaluateInST(page, async (input) => {
        const suite = globalThis.storyOrchestratorLiveSuite;
        if (!suite?.runSceneArm) throw new Error('storyOrchestratorLiveSuite.runSceneArm not registered (rebuild + st-session reload)');
        return suite.runSceneArm(input.spec, input.arm, input.chunkBudget ?? undefined);
      }, { spec, arm, chunkBudget });
    }
    const row = { name: scene.name, slice: scene.slice, lang: scene.lang, A: scoreArm(scene.expected, readings.A), B: scoreArm(scene.expected, readings.B), raw: { A: readings.A.raw, B: readings.B.raw } };
    rows.push(row);
    console.log(`${scene.name} [${scene.slice}] A ${row.A.found}/${row.A.items} (${row.A.promptChars} ch) B ${row.B.found}/${row.B.items} (${row.B.promptChars} ch) forbidden A ${row.A.forbiddenHits} B ${row.B.forbiddenHits}`);
  }
  const slice = (name: string, arm: 'A' | 'B') => sliceTotals(rows.filter((row) => row.slice === name).map((row) => row[arm]));
  const slices = { long: { A: slice('long', 'A'), B: slice('long', 'B') }, short: { A: slice('short', 'A'), B: slice('short', 'B') } };
  const verdict = f3Verdict(slices);
  const report = { dir, chunkBudget, scenes: rows.length, slices, verdict, rows };
  await writeJSON(report, 'so-f3-arms-report');
  if (record) {
    await mkdir(record, { recursive: true });
    await writeFile(join(record, 'so-f3-arms-report.json'), `${JSON.stringify(report, null, 2)}\n`);
  }
  console.log(JSON.stringify({ slices, verdict }, null, 2));
  return { ok: true };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (process.argv[2] !== 'run' || hasHelpFlag()) {
    console.log(USAGE);
    process.exit(hasHelpFlag() ? 0 : 1);
  }
  const dir = argValue('--dir', join(PROJECT_ROOT, 'test/fixtures/f3-scene'));
  const budgetRaw = argValue('--chunk-budget', '');
  const record = argValue('--record', '') || null;
  runCli((page) => runArms(page, { dir, chunkBudget: budgetRaw ? Number(budgetRaw) : null, record }));
}
