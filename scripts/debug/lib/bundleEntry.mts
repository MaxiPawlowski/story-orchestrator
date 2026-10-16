import { createRequire } from 'node:module';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, relative, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';

export const REPO_ROOT = resolve(import.meta.dirname, '..', '..', '..');
export const PRIVATE_DIR = join(REPO_ROOT, 'test', 'sessions');

const loaded = new Map<string, Promise<unknown>>();

export function loadEntry<T>(entry: string): Promise<T> {
  if (!loaded.has(entry)) {
    loaded.set(entry, (async () => {
      const require = createRequire(import.meta.url);
      const built = await require('esbuild').build({
        entryPoints: [join(REPO_ROOT, entry)], bundle: true, platform: 'node', format: 'esm', target: 'node22',
        tsconfig: join(REPO_ROOT, 'tsconfig.json'), write: false, logLevel: 'silent',
      });
      const dir = await mkdtemp(join(tmpdir(), 'so-entry-'));
      const file = join(dir, 'entry.mjs');
      await writeFile(file, built.outputFiles[0].text, 'utf-8');
      return import(pathToFileURL(file).href);
    })());
  }
  return loaded.get(entry) as Promise<T>;
}

export function refusePrivateOutput(synthetic: boolean, out: string, what: string): void {
  if (synthetic) return;
  const target = resolve(out);
  const inRepo = !relative(REPO_ROOT, target).startsWith('..');
  const inPrivate = target.startsWith(PRIVATE_DIR + sep);
  if (inRepo && !inPrivate) throw new Error(`refused: private ${what} output inside the public repo (${out}); write under test/sessions/ (so-sessions) or outside the repo`);
}
