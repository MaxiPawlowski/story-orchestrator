import { randomBytes } from 'node:crypto';
import { existsSync } from 'node:fs';
import { appendFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEBUG_DIR, PROJECT_ROOT } from './lib/connection.mts';
import { hasHelpFlag, runCli } from './lib/cli.mts';
import { saveSettingsNow } from './lib/settingsSave.mts';
import { waitSchedulerIdle } from './lib/sessionLive.mts';
import { armPayloadCapture, drainPayloads } from './st-payload.mts';
import { runR4Turn, type R4LiveDeps } from './lib/r4Live.mts';
import {
  assertFrozen, buildPack, freezeTurns, packDigest, packLeaks, scoreRatings, seededRandom,
  type R4Key, type R4Pack, type R4Ratings, type R4TurnRecord, type R4TurnsFile,
} from './lib/r4Pack.mts';

export const DEFAULT_TURNS = join(PROJECT_ROOT, 'test', 'measurements', 'v2.6-05', 'r4-turns.json');

const USAGE = `Usage: node scripts/debug/so-r4-spike.mts <freeze|check|run|pack|score> [options]

v2.6 plan 05 R4 spike: checkpoint effects.reasoning "high" vs the same checkpoint without it, on 20 declared climax turns.
Recipe and floors: test/measurements/v2.6-05/r4-spike.json.

  freeze [--turns <file>]                 refuse placeholders, then write frozenSha256 into the turns file (commit it)
  check  [--turns <file>]                 verify the turns file is complete and frozen as recorded
  run    [--turns <file>] [--run-id <id>] [--order-seed <s>] [--only <turnId>]
                                          live, dev build, one lane: for each turn generate control and arm (order seeded per
                                          turn), capture the request, record latency, delete the reply; appends
                                          <debug>/r4/<run-id>/records.jsonl. spikes.reasoningEffect is restored and saved after.
  pack   --run <dir> [--turns <file>] [--seed <s>]
                                          build the blind pack (human/rating-pack/r4-pack.json + .md + ratings template) and the
                                          sealed key (sealed/r4-key.json); refuses on any leak or an unfrozen turns file
  score  --run <dir> [--turns <file>] [--ratings <file>]
                                          refuses unless the turns file and the pack are byte-identical to what the key recorded;
                                          writes <run>/score.json; exit 0 only when the floor holds`;

const argValue = (args: string[], name: string, fallback = ''): string => {
  const index = args.indexOf(name);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
};

const readJson = async <T,>(path: string): Promise<T> => JSON.parse(await readFile(path, 'utf-8')) as T;

const writeJson = async (path: string, value: unknown) => {
  await mkdir(resolve(path, '..'), { recursive: true });
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, 'utf-8');
};

export const runDirFor = (runId: string, root = DEBUG_DIR) => join(root, 'r4', runId);

export const packPaths = (runDir: string) => ({
  pack: join(runDir, 'human', 'rating-pack', 'r4-pack.json'),
  readable: join(runDir, 'human', 'rating-pack', 'r4-pack.md'),
  template: join(runDir, 'human', 'rating-pack', 'r4-ratings.template.json'),
  ratings: join(runDir, 'human', 'rating-pack', 'r4-ratings.json'),
  key: join(runDir, 'sealed', 'r4-key.json'),
  records: join(runDir, 'records.jsonl'),
  run: join(runDir, 'run.json'),
  score: join(runDir, 'score.json'),
});

export const armFirstFor = (orderSeed: string, turnId: string): boolean => seededRandom(`${orderSeed}:${turnId}`)() < 0.5;

export async function readRecords(path: string): Promise<R4TurnRecord[]> {
  const latest = new Map<string, R4TurnRecord>();
  for (const line of (await readFile(path, 'utf-8')).split(/\r?\n/).filter((row) => row.trim())) {
    const record = JSON.parse(line) as R4TurnRecord;
    latest.set(record.turnId, record);
  }
  return [...latest.values()];
}

export function renderPack(pack: R4Pack): string {
  const lines = [`# R4 rating pack`, '', pack.question, ''];
  for (const item of pack.items) {
    lines.push(`## ${item.id}`, '', '### Context', '');
    item.context.forEach((line) => lines.push(`**${line.name}:** ${line.text}`, ''));
    lines.push('### Reply A', '', item.replyA, '', '### Reply B', '', item.replyB, '');
  }
  return lines.join('\n');
}

export async function packRun(runDir: string, turnsPath: string, seed: string): Promise<{ items: number; excluded: R4Key['excluded']; packSha256: string }> {
  const paths = packPaths(runDir);
  const turns = await readJson<R4TurnsFile>(turnsPath);
  const turnsSha256 = assertFrozen(turns);
  const run = await readJson<{ runId: string; turnsSha256: string }>(paths.run);
  if (run.turnsSha256 !== turnsSha256) throw new Error(`the turns file changed since run ${run.runId} (run ${run.turnsSha256}, now ${turnsSha256})`);
  const records = (await readRecords(paths.records)).filter((record) => turns.turns.some((turn) => turn.id === record.turnId));
  const { pack, key } = buildPack(records, { seed, runId: run.runId, turnsSha256 });
  const leaks = packLeaks(pack, key, turns.turns.map((turn) => turn.id));
  if (leaks.length) throw new Error(`refusing to write a pack that leaks the arm (re-pack with another --seed if it is position, fix the text otherwise):\n- ${leaks.join('\n- ')}`);
  if (existsSync(paths.key)) throw new Error(`${paths.key} already exists; a sealed key is never overwritten`);
  await writeJson(paths.pack, pack);
  await writeFile(paths.readable, renderPack(pack), 'utf-8');
  await writeJson(paths.template, { packSha256: key.packSha256, rater: '', ratings: pack.items.map((item) => ({ item: item.id, prefer: null })) });
  await writeJson(paths.key, key);
  return { items: pack.items.length, excluded: key.excluded, packSha256: key.packSha256 };
}

export async function scoreRun(runDir: string, turnsPath: string, ratingsPath: string) {
  const paths = packPaths(runDir);
  const turns = await readJson<R4TurnsFile>(turnsPath);
  const turnsSha256 = assertFrozen(turns);
  const pack = await readJson<R4Pack>(paths.pack);
  const key = await readJson<R4Key>(paths.key);
  const ratings = await readJson<R4Ratings>(ratingsPath);
  const score = scoreRatings({ pack, key, ratings, turnsSha256, minItems: turns.turns.length });
  const record = { ...score, runId: key.runId, packSha256: packDigest(pack), turnsSha256, rater: ratings.rater ?? null, excluded: key.excluded };
  await writeJson(paths.score, record);
  return record;
}

export async function runSpike(page: any, { turnsPath, runId, orderSeed: asked, only, deps, root = DEBUG_DIR }: { turnsPath: string; runId: string; orderSeed: string | null; only: string | null; deps: R4LiveDeps; root?: string }) {
  const turns = await readJson<R4TurnsFile>(turnsPath);
  const turnsSha256 = assertFrozen(turns);
  const paths = packPaths(runDirFor(runId, root));
  let orderSeed = asked ?? randomBytes(8).toString('hex');
  if (existsSync(paths.run)) {
    const run = await readJson<{ turnsSha256: string; orderSeed: string }>(paths.run);
    if (run.turnsSha256 !== turnsSha256) throw new Error(`run ${runId} was started on other turns (${run.turnsSha256})`);
    if (asked && run.orderSeed !== asked) throw new Error(`run ${runId} was started with order seed ${run.orderSeed}, not ${asked}`);
    orderSeed = run.orderSeed;
  } else {
    await writeJson(paths.run, { runId, turnsPath, turnsSha256, orderSeed, startedAt: new Date().toISOString() });
  }
  const selected = turns.turns.filter((turn) => !only || turn.id === only);
  if (!selected.length) throw new Error(`no turn ${only}`);
  const done: string[] = [];
  for (const turn of selected) {
    const record = await runR4Turn(page, turn, { armFirst: armFirstFor(orderSeed, turn.id), deps });
    await appendFile(paths.records, `${JSON.stringify(record)}\n`, 'utf-8');
    done.push(turn.id);
  }
  return { ok: true, runId, runDir: runDirFor(runId, root), done };
}

const liveDeps = (): R4LiveDeps => ({ armCapture: armPayloadCapture, drain: drainPayloads as R4LiveDeps['drain'], waitIdle: (page) => waitSchedulerIdle(page) });

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const command = args[0];
  const turnsPath = resolve(argValue(args, '--turns', DEFAULT_TURNS));
  const main = async (): Promise<number> => {
    if (command === 'freeze') {
      const frozen = freezeTurns(await readJson<R4TurnsFile>(turnsPath));
      await writeJson(turnsPath, frozen);
      console.log(JSON.stringify({ ok: true, turnsPath, frozenSha256: frozen.frozenSha256 }, null, 2));
      return 0;
    }
    if (command === 'check') {
      console.log(JSON.stringify({ ok: true, turnsPath, frozenSha256: assertFrozen(await readJson<R4TurnsFile>(turnsPath)) }, null, 2));
      return 0;
    }
    if (command === 'pack') {
      const runDir = resolve(argValue(args, '--run'));
      console.log(JSON.stringify({ ok: true, ...(await packRun(runDir, turnsPath, argValue(args, '--seed') || randomBytes(16).toString('hex'))) }, null, 2));
      return 0;
    }
    if (command === 'score') {
      const runDir = resolve(argValue(args, '--run'));
      const score = await scoreRun(runDir, turnsPath, resolve(argValue(args, '--ratings', packPaths(runDir).ratings)));
      console.log(JSON.stringify(score, null, 2));
      return score.ok ? 0 : 1;
    }
    console.log(USAGE);
    return hasHelpFlag() ? 0 : 1;
  };
  if (command === 'run' && !hasHelpFlag()) {
    runCli(async (page) => {
      try {
        const result = await runSpike(page, {
          turnsPath,
          runId: argValue(args, '--run-id') || new Date().toISOString().replace(/[:.]/g, '-'),
          orderSeed: argValue(args, '--order-seed') || null,
          only: argValue(args, '--only') || null,
          deps: liveDeps(),
        });
        console.log(JSON.stringify(result, null, 2));
        return result;
      } finally {
        await saveSettingsNow(page);
      }
    });
  } else {
    main().then((code) => process.exit(code), (error) => {
      console.error('Error:', error instanceof Error ? error.message : String(error));
      process.exit(1);
    });
  }
}
