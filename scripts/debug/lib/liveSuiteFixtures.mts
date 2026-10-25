import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { REPO_ROOT } from './bundleEntry.mts';

export const FIX_DIR = join(REPO_ROOT, 'test/fixtures');

export const FIXTURE_SETS = { extractor: /^extractor.*\.story\.json$/, time: /^timewindow.*\.story\.json$/, adversarial: /^adversarial.*\.story\.json$/ } as const;

export type FixtureSet = keyof typeof FIXTURE_SETS;

export interface LiveSuiteFixture {
  name: string;
  story: unknown;
  transcript: Array<{ index?: number; speaker: string; text: string; is_user?: boolean }>;
  expected: Record<string, any>;
  hints: Record<string, Record<string, unknown>> | null;
}

const readJson = async (path: string) => JSON.parse(await readFile(path, 'utf-8'));

export async function discoverFixtures(filter: string | null | undefined, set: FixtureSet = 'extractor', dir: string = FIX_DIR): Promise<LiveSuiteFixture[]> {
  const names = (await readdir(dir))
    .filter((file) => FIXTURE_SETS[set].test(file))
    .map((file) => file.replace(/\.story\.json$/, ''))
    .filter((name) => !filter || name.includes(filter))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  const fixtures: LiveSuiteFixture[] = [];
  for (const name of names) {
    try {
      const story = await readJson(join(dir, `${name}.story.json`));
      const transcript = await readJson(join(dir, `${name}.transcript.json`));
      const expected = await readJson(join(dir, `${name}.expected.json`));
      const hints = await readJson(join(dir, `${name}.hints.json`)).catch(() => null);
      fixtures.push({ name, story, transcript, expected, hints });
    } catch {
      continue;
    }
  }
  return fixtures;
}
