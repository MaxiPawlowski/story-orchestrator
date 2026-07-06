import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { evaluateInST } from './lib/evaluate.mts';
import { writeJSON } from './lib/output.mts';
import { runCli, hasHelpFlag, stripCommonArgs } from './lib/cli.mts';

export async function evalInST(page, snippet: string) {
  return evaluateInST(page, async (code) => {
    const ctx = (globalThis as any).SillyTavern.getContext();
    const rt = (globalThis as any).storyOrchestratorRuntime;
    let fn;
    try {
      fn = new Function('ctx', 'rt', `return (async () => (${code}))();`);
    } catch {
      fn = new Function('ctx', 'rt', `return (async () => { ${code} })();`);
    }
    try {
      const value = await fn(ctx, rt);
      try {
        return { ok: true, value: value === undefined ? null : JSON.parse(JSON.stringify(value)) };
      } catch {
        return { ok: true, value: String(value) };
      }
    } catch (err) {
      return { ok: false, error: err instanceof Error ? `${err.message}\n${err.stack ?? ''}` : String(err) };
    }
  }, snippet);
}

const USAGE = `Usage: node st-eval.mts "<js>" | --file <path>

Runs the snippet inside the ST page as the body of an async function with:
  ctx  SillyTavern.getContext()
  rt   globalThis.storyOrchestratorRuntime

A bare expression is returned directly; multi-statement snippets use an explicit return.
Result is printed as JSON and written to .debug/.

Examples:
  node scripts/debug/st-eval.mts "ctx.chatId"
  node scripts/debug/st-eval.mts "rt.getEpistemic().length"
  node scripts/debug/st-eval.mts "const s = rt.getSnapshot(); return { cp: s.activeCheckpointId, boundary: s.boundary };"
  node scripts/debug/st-eval.mts --file scratch/seed.js`;

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = stripCommonArgs(process.argv.slice(2)).filter((arg) => arg !== '--keep-open');
  if (!args.length || hasHelpFlag()) {
    console.log(USAGE);
    process.exit(args.length ? 0 : 1);
  }
  runCli(async (page) => {
    let snippet: string;
    const fileIndex = args.indexOf('--file');
    if (fileIndex >= 0) {
      const path = args[fileIndex + 1];
      if (!path) throw new Error('--file requires a path.');
      snippet = await readFile(path, 'utf-8');
    } else {
      snippet = args.join(' ');
    }
    const result = await evalInST(page, snippet);
    console.log(JSON.stringify(result, null, 2));
    await writeJSON(result, 'st-eval');
    return { ok: result.ok };
  });
}
