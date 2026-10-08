import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createCapture, createLineSplitter, createLlamaLogParser, execArgs, parseMetrics, parseNvidiaSmi, POD_FILES, readJsonl, requestStats, scrubNumbers, segmentLog, splitTick, teardownProblems, tickCommand, tunnelArgs, type PodDeps, type PodTarget } from './podCapture.mts';

const LOG = [
  'main: server is listening on http://127.0.0.1:8080 - starting the main loop',
  'srv  update_slots: all slots are idle',
  'slot launch_slot_: id  0 | task 12 | processing task',
  'slot update_slots: id  0 | task 12 | new prompt, n_ctx_slot = 196608, n_keep = 0, task.n_tokens = 4567',
  'slot update_slots: id  0 | task 12 | prompt done, n_tokens = 4567, batch.n_tokens = 471',
  'slot launch_slot_: id  1 | task 13 | processing task',
  'slot update_slots: id  1 | task 13 | new prompt, n_ctx_slot = 196608, n_keep = 0, n_prompt_tokens = 900',
  'slot print_timing: id  0 | task 12 | ',
  'prompt eval time =    1234.56 ms /   471 tokens (    2.62 ms per token,   381.51 tokens per second)',
  '       eval time =   12345.67 ms /   400 tokens (   30.86 ms per token,    32.40 tokens per second)',
  '      total time =   13580.23 ms /   871 tokens',
  'slot      release: id  0 | task 12 | stop processing: n_tokens = 4966, truncated = 0',
  'srv  log_server_r: request: POST /completion 127.0.0.1 200',
  'slot update_slots: id  1 | task 13 | slot context shift, n_keep = 0, n_left = 900, n_discard = 450',
  'slot print_timing: id  1 | task 13 | ',
  'prompt eval time =     300.00 ms /   900 tokens (    0.33 ms per token,  3000.00 tokens per second)',
  '       eval time =    2000.00 ms /    40 tokens (   50.00 ms per token,    20.00 tokens per second)',
  '      total time =    2300.00 ms /   940 tokens',
  'slot      release: id  1 | task 13 | stop processing: n_tokens = 940, truncated = 1',
  'srv    send_error: task id = 14, error: the request exceeds the available context size, try increasing it',
  'srv  log_server_r: request: POST /completion 127.0.0.1 400',
];

test('the llama-server log parser builds one row per request: slot, prompt tokens, timings, truncation, context shift', () => {
  const parser = createLlamaLogParser(0);
  const rows: any[] = [];
  const events: any[] = [];
  for (const line of LOG) {
    const out = parser.push(line, '2026-10-07T10:00:00.000Z');
    rows.push(...out.rows);
    events.push(...out.events);
  }
  assert.equal(rows.length, 2);
  const [a, b] = rows;
  assert.deepEqual({ task: a.task, slot: a.slot, promptTokens: a.promptTokens, nCtxSlot: a.nCtxSlot, promptEvalTokens: a.promptEvalTokens, promptMs: a.promptMs, promptTps: a.promptTps, predictedTokens: a.predictedTokens, predictedMs: a.predictedMs, predictedTps: a.predictedTps, totalMs: a.totalMs, truncated: a.truncated, contextShift: a.contextShift }, { task: 12, slot: 0, promptTokens: 4567, nCtxSlot: 196608, promptEvalTokens: 471, promptMs: 1234.56, promptTps: 381.51, predictedTokens: 400, predictedMs: 12345.67, predictedTps: 32.4, totalMs: 13580.23, truncated: false, contextShift: false });
  assert.deepEqual({ task: b.task, slot: b.slot, promptTokens: b.promptTokens, predictedTps: b.predictedTps, truncated: b.truncated, contextShift: b.contextShift }, { task: 13, slot: 1, promptTokens: 900, predictedTps: 20, truncated: true, contextShift: true });
  const kinds = events.map((event) => event.kind);
  assert.ok(kinds.includes('server-start'));
  assert.ok(kinds.includes('context-shift'));
  assert.ok(kinds.includes('context-full'), 'the exceeded-context error is its own kind');
  assert.ok(kinds.includes('http-error'), 'a 400 answer is an event; a 200 is not');
  assert.equal(kinds.filter((kind) => kind === 'http-error').length, 1);
  assert.ok(!kinds.includes('error'), 'nothing here is a bare error');
  const stats = requestStats(rows);
  assert.equal(stats.requests, 2);
  assert.equal(stats.predictedTps.min, 20);
  assert.equal(stats.predictedTps.p50, 20);
  assert.equal(stats.promptTokens.p95, 4567);
  assert.deepEqual(stats.slots, [0, 1]);
  assert.equal(stats.truncated, 1);
});

test('a log with a timestamp prefix (--log-timestamps --log-prefix) parses the same', () => {
  const parser = createLlamaLogParser(0);
  const rows: any[] = [];
  for (const line of LOG.slice(2, 12)) rows.push(...parser.push(`0.12.345.678 I ${line}`, 'x').rows);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].predictedTps, 32.4);
  assert.equal(rows[0].promptMs, 1234.56);
});

test('real errors, CUDA failures and OOM are error events', () => {
  const parser = createLlamaLogParser(0);
  const kinds = ['CUDA error: out of memory', 'srv  log_server_r: request: GET /slots 127.0.0.1 501', 'ggml_cuda_init: failed to initialize CUDA'].flatMap((line) => parser.push(line, 'x').events.map((event) => event.kind));
  assert.deepEqual(kinds, ['error', 'http-error', 'error']);
});

test('the line splitter keeps a line cut across two pulls whole', () => {
  const split = createLineSplitter();
  assert.deepEqual(split.push(Buffer.from('first\nsec')), ['first']);
  assert.deepEqual(split.push(Buffer.from('ond\n')), ['second']);
  assert.equal(split.pending(), 0);
});

test('metrics, nvidia-smi and /slots parse to numbers only', () => {
  const metrics = parseMetrics('# HELP x\nllamacpp:prompt_tokens_total 1234\nllamacpp:predicted_tokens_seconds 31.5\nllamacpp:requests_processing 2\nother 9\n');
  assert.deepEqual(metrics, { prompt_tokens_total: 1234, predicted_tokens_seconds: 31.5, requests_processing: 2 });
  const gpu = parseNvidiaSmi('0, 97, 60, 81234, 97887, 71, 412.30\n');
  assert.deepEqual(gpu.gpus, [{ index: 0, util: 97, memUtil: 60, memUsedMiB: 81234, memTotalMiB: 97887, tempC: 71, powerW: 412.3 }]);
  assert.match(parseNvidiaSmi('NVIDIA-SMI has failed because it could not communicate with the NVIDIA driver').error!, /NVIDIA-SMI has failed/);
  assert.deepEqual(scrubNumbers([{ id: 0, is_processing: true, prompt: 'the chat text', params: { temperature: 1, grammar: 'x' }, n_ctx: 98304 }]), [{ id: 0, is_processing: true, params: { temperature: 1 }, n_ctx: 98304 }]);
});

test('ssh command lines: the tunnel forwards only the llama port, exec pins the host key', () => {
  const target: PodTarget = { host: '1.2.3.4', sshPort: 17235, localPort: 18082, podId: 'p', user: 'root', key: 'K', knownHosts: 'KH', hostKeyAlias: 'runpod-llm', remoteLog: '/tmp/llama-server.log' };
  const tunnel = tunnelArgs(target);
  assert.deepEqual(tunnel.slice(0, 4), ['-N', '-T', '-L', '127.0.0.1:18082:127.0.0.1:8080']);
  assert.ok(tunnel.includes('ExitOnForwardFailure=yes') && tunnel.includes('StrictHostKeyChecking=yes') && tunnel.includes('BatchMode=yes'));
  assert.equal(tunnel.at(-1), 'root@1.2.3.4');
  assert.equal(execArgs(target, 'echo hi').at(-1), 'echo hi');
  assert.match(tickCommand('/tmp/llama-server.log', 10, 100), /tail -c \+11 '\/tmp\/llama-server\.log' 2>\/dev\/null \| head -c 100$/);
  const split = splitTick(Buffer.from('0, 1, 2, 3, 4, 5, 6\n__SO_GPU_END__\n42\n__SO_SIZE_END__\nlog bytes\n'));
  assert.equal(split!.remoteSize, 42);
  assert.equal(split!.tail.toString(), 'log bytes\n');
  assert.equal(splitTick(Buffer.from('garbage')), null);
});

function fakePod({ log = '' as string | null, gpu = '0, 50, 20, 40000, 97887, 60, 300\n', health = 200, sshDown = false } = {}) {
  const pod = { log: log === null ? null : Buffer.from(log), gpu, health, sshDown };
  let clock = Date.parse('2026-10-07T10:00:00.000Z');
  const deps: PodDeps = {
    now: () => new Date(clock += 15_000),
    async http(path) {
      if (pod.health === 0) return { status: 0, body: '' };
      if (path === '/health') return { status: pod.health, body: '{"status":"ok"}' };
      if (path === '/metrics') return { status: 200, body: 'llamacpp:prompt_tokens_total 10\nllamacpp:requests_processing 1\n' };
      if (path === '/slots') return { status: 501, body: '' };
      if (path === '/props') return { status: 200, body: JSON.stringify({ model_path: '/workspace/models/Artemis.gguf', total_slots: 4, default_generation_settings: { n_ctx: 49152 } }) };
      return { status: 404, body: '' };
    },
    async ssh(command) {
      if (pod.sshDown) return { code: 255, stdout: Buffer.alloc(0), stderr: 'Connection refused' };
      if (command.startsWith('sha256sum')) return { code: 0, stdout: Buffer.from(`${createHash('sha256').update(pod.log ?? Buffer.alloc(0)).digest('hex')}\n`), stderr: '' };
      const offset = Number(/tail -c \+(\d+)/.exec(command)![1]) - 1;
      const max = /head -c (\d+)/.exec(command);
      const size = pod.log ? String(pod.log.length) : '-1';
      let tail = pod.log ? pod.log.subarray(offset) : Buffer.alloc(0);
      if (max) tail = tail.subarray(0, Number(max[1]));
      return { code: 0, stdout: Buffer.concat([Buffer.from(`${pod.gpu}__SO_GPU_END__\n${size}\n__SO_SIZE_END__\n`), tail]), stderr: '' };
    },
  };
  return { pod, deps };
}

test('incremental pulls copy the pod log byte for byte, survive a restart as a new segment, and the final pull verifies sha256', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'so-pod-'));
  try {
    const { pod, deps } = fakePod({ log: `${LOG.slice(0, 7).join('\n')}\n` });
    const capture = createCapture(dir, deps, { maxBytes: 64 });
    for (let i = 0; i < 20; i += 1) await capture.tick();
    assert.equal(readFileSync(segmentLog(dir, 0), 'utf-8'), pod.log!.toString(), 'capped pulls still converge on the whole log');
    pod.log = Buffer.concat([pod.log!, Buffer.from(`${LOG.slice(7, 13).join('\n')}\n`)]);
    for (let i = 0; i < 20; i += 1) await capture.tick();
    assert.equal(readJsonl(join(dir, POD_FILES.requests)).length, 1);
    const firstSegment = readFileSync(segmentLog(dir, 0), 'utf-8');
    pod.log = Buffer.from(`${LOG[0]}\n`);
    for (let i = 0; i < 5; i += 1) await capture.tick();
    assert.equal(readFileSync(segmentLog(dir, 0), 'utf-8'), firstSegment, 'the old segment is kept');
    assert.equal(readFileSync(segmentLog(dir, 1), 'utf-8'), `${LOG[0]}\n`);
    assert.ok(readJsonl(join(dir, POD_FILES.events)).some((event) => event.kind === 'log-reset'));
    assert.equal(readJsonl(join(dir, POD_FILES.props)).length, 1, '/props is read once');
    assert.equal(readJsonl(join(dir, POD_FILES.samples))[0].slots, 'disabled', '--no-slots reads as disabled, not as an error');
    const record = await capture.finalPull();
    assert.equal(record.ok, true, JSON.stringify(record.problems));
    assert.equal(record.shaMatch, true);
    assert.equal(record.segment, 1);
    assert.deepEqual(teardownProblems(dir), []);
    await capture.tick();
    assert.match(teardownProblems(dir).join(' '), /ticked after the final pull/, 'a capture after the pull makes it stale');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('planted: no llama-server log on the pod (LLM_DEBUG_LOG unset) fails the final pull and refuses teardown', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'so-pod-nolog-'));
  try {
    const { deps } = fakePod({ log: null });
    const capture = createCapture(dir, deps);
    await capture.tick();
    assert.ok(readJsonl(join(dir, POD_FILES.events)).some((event) => event.kind === 'log-missing'));
    const record = await capture.finalPull();
    assert.equal(record.ok, false);
    assert.match(record.problems.join(' '), /LLM_DEBUG_LOG=1/);
    assert.match(teardownProblems(dir).join(' '), /LLM_DEBUG_LOG=1/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('planted: a local copy that differs from the pod log is caught by the sha check', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'so-pod-sha-'));
  try {
    const { deps } = fakePod({ log: 'line one\nline two\n' });
    const capture = createCapture(dir, deps);
    await capture.tick();
    writeFileSync(segmentLog(dir, 0), 'line one\nline TWO\n');
    const record = await capture.finalPull();
    assert.equal(record.shaMatch, false);
    assert.equal(record.ok, false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('teardown is refused without a final pull, and when ssh never answered', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'so-pod-down-'));
  try {
    assert.match(teardownProblems(dir).join(' '), /no final pull landed/);
    const { deps } = fakePod({ sshDown: true });
    const record = await createCapture(dir, deps).finalPull();
    assert.equal(record.ok, false);
    assert.match(record.problems.join(' '), /final log pull failed/);
    assert.match(record.problems.join(' '), /no nvidia-smi sample/);
    assert.notDeepEqual(teardownProblems(dir), []);
    assert.ok(JSON.parse(readFileSync(resolve(dir, POD_FILES.pull), 'utf-8')).ok === false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('b11046 with --log-timestamps --log-prefix puts the timings on the slot line itself; the prompt size comes from the release line', () => {
  const parser = createLlamaLogParser(0);
  const rows: any[] = [];
  for (const line of [
    '27.10.899.978 I slot launch_slot_: id  1 | task 2504 | processing task, is_child = 0',
    '27.17.786.907 I slot print_timing: id  1 | task 2504 | n_gen =    154, tg =  50.94 t/s, tg_3s =  51.27 t/s',
    '27.27.476.261 I slot print_timing: id  1 | task 2504 | prompt eval time =    3004.25 ms /  9434 tokens (    0.32 ms per token,  3140.22 tokens per second)',
    '27.27.476.265 I slot print_timing: id  1 | task 2504 |        eval time =   12693.13 ms /   648 tokens (   19.62 ms per token,    50.97 tokens per second)',
    '27.27.476.265 I slot print_timing: id  1 | task 2504 |       total time =   15697.38 ms / 10082 tokens',
    '27.27.476.266 I slot print_timing: id  1 | task 2504 |    graphs reused =       2977',
    '27.27.477.273 I slot      release: id  1 | task 2504 | stop processing: n_tokens = 10081, truncated = 0',
  ]) rows.push(...parser.push(line, '2026-10-08T03:00:00.000Z').rows);
  assert.equal(rows.length, 1);
  const [row] = rows;
  assert.deepEqual({ promptEvalTokens: row.promptEvalTokens, promptMs: row.promptMs, predictedTokens: row.predictedTokens, predictedTps: row.predictedTps, totalMs: row.totalMs, promptTokens: row.promptTokens, truncated: row.truncated }, { promptEvalTokens: 9434, promptMs: 3004.25, predictedTokens: 648, predictedTps: 50.97, totalMs: 15697.38, promptTokens: 9433, truncated: false });
  const stats = requestStats(rows);
  assert.equal(stats.predictedTps.p50, 50.97);
  assert.equal(stats.promptEvalTokens.p50, 9434);
});
