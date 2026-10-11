import { register } from 'node:module';
import { appendFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { PROJECT_ROOT } from './lib/client.mts';

register('./lib/loader.mts', import.meta.url);
const { spikeCalls } = await import('@judge/ideaSpikes') as any;
const { askJudge, JUDGE_DEFAULT_MODEL } = await import('@judge/index') as any;
const [source, runText] = process.argv.slice(2);
const run = Number(runText);
if (!source || !Number.isInteger(run) || run < 1) throw new Error('Usage: idea-session-replay.mts <private transcripts.jsonl> <run>');
const privateRoot = resolve('C:/dev/story-orchestrator/test/sessions');
const file = resolve(source);
if (!file.startsWith(`${privateRoot}\\`) && !file.startsWith(`${privateRoot}/`)) throw new Error('Replay source must remain in the private session worktree');
const sourceText = readFileSync(file, 'utf8');
const snapshots = sourceText.trim().split(/\r?\n/).map((line) => JSON.parse(line));
const windows = new Map<string, any>();
for (const snapshot of snapshots) {
  const messages = snapshot.messages ?? [];
  for (let index = 0; index < messages.length; index += 1) {
    const reply = messages[index];
    if (reply.isUser || reply.isSystem || !reply.text?.trim()) continue;
    const player = messages.slice(0, index).reverse().find((row: any) => row.isUser && row.text?.trim());
    if (!player) continue;
    const key = createHash('sha256').update(JSON.stringify([snapshot.chatId, reply.id, reply.text, player.text])).digest('hex');
    windows.set(key, { reply, player });
  }
}
const selected = [...windows.values()].slice(0, 20);
if (selected.length < 20) throw new Error('Replay needs 20 distinct reply windows; source is incomplete');
const ledger = join(PROJECT_ROOT, 'test/measurements/v2.8/13-phase-a/b4-attempts.jsonl');
let spent = existsSync(ledger) ? readFileSync(ledger, 'utf8').trim().split(/\r?\n/).filter(Boolean).length : 0;
const before = spent;
if (spent + selected.length * 3 > 300) throw new Error('Replay exceeds remaining B4 TypeSafe budget');
const fetch = globalThis.fetch;
globalThis.fetch = async (input, init) => {
  if (!String(input).startsWith('https://api.typesafe.ai/v1/systemone')) throw new Error('Only the protected TypeSafe upstream is allowed');
  if (spent >= 300) throw new Error('B4 TypeSafe budget exhausted');
  spent += 1;
  appendFileSync(ledger, `${JSON.stringify({ at: new Date().toISOString(), idea: 'session-replay', run, attempt: spent })}\n`);
  return fetch(input, init);
};
const plugin = await import(pathToFileURL(join(PROJECT_ROOT, 'server-plugin/story-orchestrator-judge/index.mjs')).href);
const handlers = plugin.createHandlers({ accountsEnabled: false });
const transport = async (request: unknown) => {
  let status = 200;
  let body: unknown;
  const response = { status(value: number) { status = value; return response; }, type() { return response; }, json(value: unknown) { body = value; return response; }, send(value: string) { body = JSON.parse(value); return response; } };
  await handlers.systemone({ body: request }, response);
  if (status !== 200) throw new Error(`Protected judge handler returned HTTP ${status}`);
  return body;
};
const calls: unknown[] = [];
const bins: Record<string, Record<string, number>> = {};
let unanswered = 0;
for (const [index, window] of selected.entries()) {
  for (const idea of ['attention', 'adversity', 'idle']) {
    const row = idea === 'attention' ? { id: `reply-${index}`, playerMessage: window.player.text, reply: { speaker: window.reply.name, text: window.reply.text }, group: true, addressed: true, label: 'partial' }
      : idea === 'adversity' ? { id: `reply-${index}`, playerName: window.player.name, reply: window.reply.text, level: 0 }
        : { id: `reply-${index}`, reply: window.reply.text, change: 0, tension: 0 };
    const request = spikeCalls(idea, { revision: 1, player: window.player.name, rows: [row] })[0].request;
    const result = await askJudge(transport, { ...request, model: JUDGE_DEFAULT_MODEL }, { timeoutMs: 10000 });
    if (!result.answers) unanswered += 1;
    for (const [key, answer] of Object.entries(result.answers ?? {}) as Array<[string, any]>) {
      const bin = String(Math.round(answer.score));
      bins[key] ??= {};
      bins[key][bin] = (bins[key][bin] ?? 0) + 1;
    }
    calls.push({ idea, index, request, result });
  }
}
const summary = { run, windows: selected.length, availableWindows: windows.size, actualCalls: spent - before, unanswered, bins, sourceHash: createHash('sha256').update(sourceText).digest('hex'), labels: 'distribution only; no accuracy or private-label claim' };
writeFileSync(join(dirname(file), `b4-judge-replay.run${run}.json`), `${JSON.stringify({ summary, calls }, null, 2)}\n`);
writeFileSync(join(PROJECT_ROOT, `test/measurements/v2.8/13-phase-a/session-summary.run${run}.json`), `${JSON.stringify(summary, null, 2)}\n`);
console.log(JSON.stringify(summary));
process.exit(unanswered ? 2 : 0);
