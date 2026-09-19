import { statSync } from 'node:fs';
import { dirname, resolve as resolvePath } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const SRC = resolvePath(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..', 'src');
const ALIASES = new Set(['components', 'services', 'utils', 'constants', 'engine', 'runtime', 'extraction', 'pacing', 'generation', 'memory', 'copilot', 'talk', 'wizard', 'stagecraft', 'judge']);

const isFile = (path: string) => {
  try {
    return statSync(path).isFile();
  } catch {
    return false;
  }
};

const withExtension = (base: string) => [base, `${base}.ts`, `${base}.tsx`, resolvePath(base, 'index.ts')].find(isFile) ?? null;

interface ResolveContext { parentURL?: string }
type NextResolve = (specifier: string, context: ResolveContext) => Promise<unknown>;

export async function resolve(specifier: string, context: ResolveContext, next: NextResolve) {
  const alias = specifier.match(/^@(\w+)\/(.+)$/);
  if (alias && ALIASES.has(alias[1])) {
    const found = withExtension(resolvePath(SRC, alias[1], alias[2]));
    if (found) return { url: pathToFileURL(found).href, format: found.endsWith('.ts') ? 'module-typescript' : 'module', shortCircuit: true };
  }
  const parent = context.parentURL?.startsWith('file:') ? fileURLToPath(context.parentURL) : null;
  if (parent && parent.startsWith(SRC) && (specifier.startsWith('./') || specifier.startsWith('../'))) {
    const found = withExtension(resolvePath(dirname(parent), specifier));
    if (found) return { url: pathToFileURL(found).href, format: found.endsWith('.ts') ? 'module-typescript' : 'module', shortCircuit: true };
  }
  return next(specifier, context);
}
