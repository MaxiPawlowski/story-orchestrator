import { createRequire } from 'node:module';
import { mkdtemp, readdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const REPO_ROOT = resolve(import.meta.dirname, '..', '..', '..');

type ReplayModule = typeof import('./j6dReplayEntry.ts');

let loaded: Promise<ReplayModule> | null = null;

export function loadReplay(): Promise<ReplayModule> {
  loaded ??= (async () => {
    const require = createRequire(import.meta.url);
    const built = await require('esbuild').build({
      entryPoints: [join(REPO_ROOT, 'scripts/debug/lib/j6dReplayEntry.ts')], bundle: true, platform: 'node', format: 'esm', target: 'node22',
      tsconfig: join(REPO_ROOT, 'tsconfig.json'), write: false, logLevel: 'silent',
    });
    const dir = await mkdtemp(join(tmpdir(), 'so-j6d-replay-'));
    const file = join(dir, 'replay.mjs');
    await writeFile(file, built.outputFiles[0].text, 'utf-8');
    return import(pathToFileURL(file).href) as Promise<ReplayModule>;
  })();
  return loaded;
}

const pick = (names: string[], pattern: RegExp) => names.filter((name) => pattern.test(name)).sort();

export async function readSessionDir(dir: string) {
  const names = await readdir(dir);
  const runtime = pick(names, /^runtime-.+\.json$/);
  if (!runtime.length) throw new Error(`${dir}: no runtime-*.json (the archived runtime blob holds the pinned story and the boundary history)`);
  if (!existsSync(join(dir, 'journal.jsonl'))) throw new Error(`${dir}: no journal.jsonl (the journal tail holds the full read audits)`);
  const chatFull = pick(names, /^chat-full-.+\.json$/);
  const text = (name: string) => readFile(join(dir, name), 'utf-8');
  return {
    journal: await text('journal.jsonl'),
    transcripts: names.includes('transcripts.jsonl') ? await text('transcripts.jsonl') : undefined,
    runtime: JSON.parse(await text(runtime[runtime.length - 1])),
    chatFull: chatFull.length ? JSON.parse(await text(chatFull[chatFull.length - 1])) : undefined,
  };
}

export async function reconstruct(dirs: string[]) {
  const replay = await loadReplay();
  const sessions = [];
  for (const dir of dirs) {
    const archive = replay.readSessionArchive(await readSessionDir(dir));
    const story = replay.parseStoryV2OrThrow(archive.storyRaw);
    const rebuilt = replay.rebuildSession(archive, story);
    sessions.push({ dir, storyId: archive.storyId, story: archive.storyRaw, audits: archive.audits.length, ...rebuilt });
  }
  return { at: new Date().toISOString(), plan: 'v2.8 12 J6d option C', sessions };
}

export type Reconstruction = Awaited<ReturnType<typeof reconstruct>>;

export async function compare(reconstruction: Reconstruction, replies: Record<string, Array<{ text: string; finish?: 'stop' | 'length' | 'unknown' }>>) {
  const replay = await loadReplay();
  const rows = [];
  const refusedReplies = [];
  const unasked = [];
  const refusals = reconstruction.sessions.flatMap((session) => session.refusals);
  for (const session of reconstruction.sessions) {
    const story = replay.parseStoryV2OrThrow(session.story);
    const result = replay.compareCases({ cases: session.cases, story, replies });
    rows.push(...result.rows);
    refusedReplies.push(...result.refusedReplies);
    unasked.push(...result.unasked);
  }
  const cases = reconstruction.sessions.reduce((sum, session) => sum + session.cases.length, 0);
  const summary = replay.summarizeReplay({ rows, refusedReplies, unasked }, refusals, cases);
  const skipped = reconstruction.sessions.reduce((sum, session) => ({
    'not-judged': sum['not-judged'] + session.skipped['not-judged'], 'judge-failed': sum['judge-failed'] + session.skipped['judge-failed'],
  }), { 'not-judged': 0, 'judge-failed': 0 });
  return { summary: { ...summary, skipped }, arbitrationSample: replay.arbitrationSample(rows), rows };
}

export const publicSummary = (result: Awaited<ReturnType<typeof compare>>) => ({
  ...result.summary,
  arbitrationSample: result.arbitrationSample.length,
});
