export const K0_FIXTURE_NAME = 'contradiction-release';
export const K0_FIXTURE = 'test/fixtures/memory/contradictions.json';
export const K0_BRACKET_DIR = 'test/fixtures/memory';
export const COSINE_SAME_TOPIC = 0.55;

export interface ReleaseRow {
  id: string;
  lang: string;
  label: string;
  established: string;
  claim: string;
  band?: { jaccard: string };
}

export interface ReleaseFixture {
  use: string;
  rows: ReleaseRow[];
}

export interface Brackets {
  bundle: string;
  rows: Record<string, number>;
}

export const releaseFixturePath = (name: string): string =>
  name === K0_FIXTURE_NAME ? K0_FIXTURE : `test/fixtures/judge/${name.replace(/\.json$/, '')}.json`;

export const releaseCases = (fixture: ReleaseFixture) =>
  fixture.rows.map(({ id, lang, label, established, claim }) => ({ id, lang, label, established, claim }));

export const bracketFileNames = (names: string[]): string[] =>
  names.filter((name) => /^contradictions\.cosine\.[0-9a-f]{12}\.json$/.test(name)).sort();

export function releaseModes(fixture: ReleaseFixture, brackets: Brackets[]): Record<string, string[] | null> {
  if (!fixture.rows.some((row) => row.band)) return { holdout: fixture.rows.map((row) => row.id) };
  const jaccard = fixture.rows.filter((row) => row.band?.jaccard !== 'below').map((row) => row.id);
  if (!brackets.length) return { jaccard, vectors: null };
  const modes: Record<string, string[] | null> = { jaccard };
  for (const file of brackets) {
    const missing = fixture.rows.filter((row) => typeof file.rows[row.id] !== 'number').map((row) => row.id);
    if (missing.length) throw new Error(`bracket file ${file.bundle} has no cosine for ${missing.join(', ')}`);
    modes[`vectors:${file.bundle}`] = fixture.rows.filter((row) => jaccard.includes(row.id) || file.rows[row.id] >= COSINE_SAME_TOPIC).map((row) => row.id);
  }
  return modes;
}
