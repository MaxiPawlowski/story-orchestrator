import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import http from 'node:http';
import net from 'node:net';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const python = ['python', 'python3', 'py'].find((name) => spawnSync(name, ['--version'], { encoding: 'utf8' }).status === 0);
const skip = python ? false : 'no python on PATH';

const freePort = () => new Promise((resolve) => {
    const probe = net.createServer().listen(0, '127.0.0.1', () => {
        const { port } = probe.address();
        probe.close(() => resolve(port));
    });
});

async function slowUpstream(delayMs) {
    const seen = [];
    const server = http.createServer((request, response) => {
        seen.push(Date.now());
        request.resume();
        setTimeout(() => {
            response.writeHead(200, { 'Content-Type': 'application/json' });
            response.end(JSON.stringify({ answers: { a: 0.7 } }));
        }, delayMs);
    });
    const port = await freePort();
    await new Promise((resolve) => server.listen(port, '127.0.0.1', resolve));
    return { url: `http://127.0.0.1:${port}`, seen, close: () => new Promise((resolve) => server.close(resolve)) };
}

async function startJudge(upstream, queueTimeout) {
    const port = await freePort();
    const child = spawn(python, [path.join(here, 'judgeServer.py'), '--backend', 'proxy', '--upstream', upstream, '--model-id', 'queue-test',
        '--port', String(port), '--queue-timeout', String(queueTimeout)], { stdio: 'ignore', windowsHide: true });
    const base = `http://127.0.0.1:${port}`;
    for (let i = 0; i < 100; i += 1) {
        try {
            if ((await fetch(`${base}/health`)).ok) return { base, stop: () => child.kill() };
        } catch {
            await new Promise((resolve) => setTimeout(resolve, 100));
        }
    }
    child.kill();
    throw new Error('judge server did not start');
}

const ask = (base, signal) => fetch(`${base}/v1/systemone`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ state: { s: 'x' }, questions: { a: { type: 'noul', instructions: 'is it?' } } }),
    signal,
});

test('v2.8 14: a request whose client left while it queued is skipped, never sent to the model', { skip }, async () => {
    const upstream = await slowUpstream(800);
    const judge = await startJudge(upstream.url, 5);
    try {
        const first = ask(judge.base);
        await new Promise((resolve) => setTimeout(resolve, 100));
        const controller = new AbortController();
        const abandoned = ask(judge.base, controller.signal).catch((error) => error.name);
        setTimeout(() => controller.abort(), 200);
        assert.equal((await first).status, 200);
        assert.equal(await abandoned, 'AbortError');
        await new Promise((resolve) => setTimeout(resolve, 600));
        const health = await (await fetch(`${judge.base}/health`)).json();
        assert.equal(upstream.seen.length, 1);
        assert.deepEqual(health.shed, { busy: 0, gone: 1 });
    } finally {
        judge.stop();
        await upstream.close();
    }
});

test('v2.8 14: a request that waits past the queue timeout is refused busy (503) instead of piling up', { skip }, async () => {
    const upstream = await slowUpstream(1500);
    const judge = await startJudge(upstream.url, 0.3);
    try {
        const first = ask(judge.base);
        await new Promise((resolve) => setTimeout(resolve, 100));
        const second = await ask(judge.base);
        assert.equal(second.status, 503);
        assert.equal((await second.json()).busy, true);
        assert.equal((await first).status, 200);
        assert.equal(upstream.seen.length, 1);
    } finally {
        judge.stop();
        await upstream.close();
    }
});
