import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

export type Exec = (command: string, args: string[], input: string, env: Record<string, string>, cwd: string) => Promise<{ code: number; stdout: string; stderr: string }>;
export type ModelReply = { text: string; model: string | null };

export const SOL_MODEL = 'openai/gpt-6.1-sol';
export const LABEL_TIMEOUT_MS = 900_000;
const SYSTEM = 'You are a careful reader of roleplay transcripts. You answer with exactly one JSON object.';

export const spawnExec: Exec = (command, args, input, env, cwd) => new Promise((done) => {
  const child = spawn(command, args, { cwd, env: { ...process.env, ...env }, windowsHide: true });
  let stdout = '';
  let stderr = '';
  const timer = setTimeout(() => child.kill(), LABEL_TIMEOUT_MS);
  child.stdout.on('data', (chunk) => { stdout += chunk; });
  child.stderr.on('data', (chunk) => { stderr += chunk; });
  child.on('error', (error) => { clearTimeout(timer); done({ code: 1, stdout, stderr: `${stderr}${error.message}` }); });
  child.on('close', (code) => { clearTimeout(timer); done({ code: code ?? 1, stdout, stderr }); });
  child.stdin.end(input);
});

export function refuseFastModel(model: string): void {
  if (/-fast\b/i.test(model) || /\bdeepseek\b/i.test(model)) throw new Error(`refused: ${model} (no -fast variant, no DeepSeek for E0 labels)`);
}

export const opencodeConfig = (systemFile: string) => JSON.stringify({
  $schema: 'https://opencode.ai/config.json',
  agent: { 'so-e0': { mode: 'primary', prompt: `{file:${systemFile.replace(/\\/g, '/')}}`, tools: { '*': false }, permission: { edit: 'deny', bash: 'deny', webfetch: 'deny' } } },
});

export function opencodeText(stdout: string): string {
  return stdout.split(/\r?\n/).map((line) => line.trim()).filter((line) => line.startsWith('{'))
    .map((line) => { try { return JSON.parse(line); } catch { return null; } })
    .filter((event) => event?.type === 'text').map((event) => event.part?.text ?? '').join('');
}

export async function askSol(prompt: string, workDir: string, exec: Exec = spawnExec, model = SOL_MODEL): Promise<ModelReply> {
  refuseFastModel(model);
  const systemFile = join(workDir, 'so-e0-system.txt');
  writeFileSync(systemFile, SYSTEM, 'utf-8');
  const run = await exec('opencode', ['run', '--standalone', '--format', 'json', '--agent', 'so-e0', '-m', model], prompt, { OPENCODE_CONFIG_CONTENT: opencodeConfig(systemFile) }, workDir);
  const text = opencodeText(run.stdout);
  if (run.code !== 0 || !text) throw new Error(`opencode ${model} failed (exit ${run.code}): ${run.stderr.slice(-400)}`);
  return { text, model };
}

export async function askClaude(prompt: string, workDir: string, exec: Exec = spawnExec): Promise<ModelReply> {
  const run = await exec('claude', ['-p', '--output-format', 'json', '--tools', '', '--no-session-persistence', '--strict-mcp-config', '--append-system-prompt', SYSTEM], prompt, {}, workDir);
  let parsed: { result?: unknown; is_error?: unknown; modelUsage?: Record<string, unknown> } | null = null;
  try {
    parsed = JSON.parse(run.stdout);
  } catch {
    parsed = null;
  }
  if (run.code !== 0 || !parsed || parsed.is_error === true || typeof parsed.result !== 'string') throw new Error(`claude -p failed (exit ${run.code}): ${(run.stderr || run.stdout).slice(-400)}`);
  const model = Object.keys(parsed.modelUsage ?? {})[0] ?? null;
  return { text: parsed.result, model };
}
