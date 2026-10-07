import { spawn } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';

const gateway = 'http://127.0.0.1:18888';
const status = async () => (await fetch(`${gateway}/status`)).json();
const before = await status();
const queue = await (await fetch('http://127.0.0.1:8188/queue')).json();
if (before.imageLease || before.activeText || before.waitingText || queue.queue_running.length || queue.queue_pending.length) throw new Error('Use an idle controller and ComfyUI.');
const began = new Date().toISOString();
const report = { began, condition: 'isolated-no-concurrent-build-gates', ok: false, before, queued: null, reply: null, log: '' };
const child = spawn(process.execPath, ['scripts/debug/st-lanes.mts', 'run', '6', '--', 'scripts/debug/so-saga-sprites.mts', 'Natalia', '--warm-batch', '--limit', '2'],
  { cwd: 'C:/dev/story-orchestrator', windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
child.stdout.on('data', (data) => { report.log += data.toString(); });
child.stderr.on('data', (data) => { report.log += data.toString(); });
const completed = new Promise((done) => child.once('close', done));
let reading;
try {
  const deadline = Date.now() + 300000;
  let active = false;
  while (Date.now() < deadline && child.exitCode === null) {
    const state = await status();
    const q = await (await fetch('http://127.0.0.1:8188/queue')).json();
    if (state.imageLease && q.queue_running.length) { active = true; break; }
    await new Promise((done) => setTimeout(done, 100));
  }
  if (!active) throw new Error('No new image was observed in flight.');
  const requestedAt = Date.now();
  reading = fetch(`${gateway}/completion`, { method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ prompt: '<|turn>user\nReply with one word: PONG.<turn|>\n<|turn>model\n<|channel>final\n', n_predict: 8, temperature: 0 }),
    signal: AbortSignal.timeout(300000) });
  let readError;
  void reading.catch((error) => { readError = error; });
  while (Date.now() < deadline) {
    if (readError) throw readError;
    const state = await status();
    if (state.imageLease && state.waitingText > 0 && state.activeText === 0) {
      report.queued = { at: new Date().toISOString(), waitingText: state.waitingText, activeText: state.activeText }; break;
    }
    await new Promise((done) => setTimeout(done, 100));
  }
  if (!report.queued) throw new Error('The real text request was not observed queued behind the current frame.');
  const response = await reading;
  const reply = await response.json();
  if (!response.ok || !reply.content?.trim()) throw new Error('Queued real text did not answer.');
  report.reply = { at: new Date().toISOString(), elapsedMs: Date.now() - requestedAt, length: reply.content.length };
  const code = await completed;
  if (code !== 0) throw new Error(`The limited image batch failed (${code}).`);
  report.after = await status();
  const imageRows = report.log.split('\n').filter((line) => line.includes('"ready":true')).length;
  if (imageRows !== 2) throw new Error('The priority check requires exactly two new saved frames.');
  const frames = JSON.parse(await readFile('C:/dev/story-orchestrator/test/measurements/v2.7/saga-main-cast/frames-Natalia-all.json', 'utf8'));
  const run = frames.runs.at(-1);
  const jobs = run.traffic.events.filter((event) => event.path.endsWith('/story-orchestrator-media/jobs'));
  if (Date.parse(run.began) < Date.parse(began) || jobs.length !== 2 || Date.parse(jobs[1].at) < Date.parse(report.reply.at)) {
    throw new Error('The next image started before the real queued text finished.');
  }
  report.secondImageAt = jobs[1].at;
  report.savedFrames = imageRows;
  report.ok = true;
} catch (error) { report.error = String(error); process.exitCode = 1; }
finally {
  if (reading) await reading.catch(() => undefined);
  await completed;
  const path = 'C:/dev/story-orchestrator/test/measurements/v2.7/saga-main-cast/warm-batch-priority.json';
  const previous = await readFile(path, 'utf8').catch(() => null);
  if (previous) {
    const old = JSON.parse(previous);
    await writeFile(path.replace('.json', `-${old.began.replace(/[:.]/g, '-')}.json`), previous);
  }
  await writeFile(path, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ path, ok: report.ok, queued: report.queued, reply: report.reply, savedFrames: report.savedFrames, error: report.error }));
}
