import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import http from 'node:http';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const python = ['python', 'python3', 'py'].find((name) => spawnSync(name, ['--version'], { encoding: 'utf8' }).status === 0);
const skip = python ? false : 'no python on PATH';

const until = async (check, ms = 60_000) => {
    const started = Date.now();
    while (Date.now() - started < ms) {
        if (await check()) return true;
        await new Promise((resolve) => setTimeout(resolve, 25));
    }
    return false;
};

async function heldUpstream() {
    const seen = [];
    const held = [];
    let released = false;
    const server = http.createServer((request, response) => {
        seen.push(Date.now());
        request.resume();
        const answer = () => {
            response.writeHead(200, { 'Content-Type': 'application/json' });
            response.end(JSON.stringify({ answers: { a: 0.7 } }));
        };
        if (released) answer();
        else held.push(answer);
    });
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    return {
        url: `http://127.0.0.1:${server.address().port}`,
        seen,
        arrived: (count) => until(() => seen.length >= count),
        release: () => {
            released = true;
            for (const answer of held.splice(0)) answer();
        },
        close: () => new Promise((resolve) => {
            server.closeAllConnections();
            server.close(resolve);
        }),
    };
}

async function startJudge(upstream, queueTimeout) {
    const child = spawn(python, [path.join(here, 'judgeServer.py'), '--backend', 'proxy', '--upstream', upstream, '--model-id', 'queue-test',
        '--port', '0', '--queue-timeout', String(queueTimeout)], { stdio: ['ignore', 'pipe', 'ignore'], windowsHide: true });
    try {
        const base = await new Promise((resolve, reject) => {
            let text = '';
            const timer = setTimeout(() => reject(new Error('judge server did not start')), 60_000);
            child.stdout.on('data', (chunk) => {
                text += chunk.toString('utf8');
                const found = text.match(/ on (http:\/\/127\.0\.0\.1:\d+),/);
                if (!found) return;
                clearTimeout(timer);
                resolve(found[1]);
            });
            child.on('exit', (code) => {
                clearTimeout(timer);
                reject(new Error(`judge server exited ${code}`));
            });
        });
        const health = async () => (await fetch(`${base}/health`, { signal: AbortSignal.timeout(30_000) })).json();
        return { base, health, stop: () => child.kill() };
    } catch (error) {
        child.kill();
        throw error;
    }
}

const ask = (base, signal) => fetch(`${base}/v1/systemone`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ state: { s: 'x' }, questions: { a: { type: 'noul', instructions: 'is it?' } } }),
    signal,
});

test('v2.8 14: a request whose client left while it queued is skipped, never sent to the model', { skip }, async () => {
    const upstream = await heldUpstream();
    const judge = await startJudge(upstream.url, 120);
    try {
        const first = ask(judge.base);
        assert.ok(await upstream.arrived(1), 'the first request holds the model');
        const controller = new AbortController();
        const abandoned = ask(judge.base, controller.signal).catch((error) => error.name);
        assert.ok(await until(async () => (await judge.health()).waiting === 1), 'the second request queues behind the first');
        controller.abort();
        assert.equal(await abandoned, 'AbortError');
        upstream.release();
        assert.equal((await first).status, 200);
        assert.ok(await until(async () => (await judge.health()).shed.gone === 1 || upstream.seen.length > 1), 'the queued request was dropped or sent on');
        const health = await judge.health();
        assert.deepEqual(health.shed, { busy: 0, gone: 1 });
        assert.equal(upstream.seen.length, 1);
    } finally {
        upstream.release();
        judge.stop();
        await upstream.close();
    }
});

test('v2.8 14: a request that waits past the queue timeout is refused busy (503) instead of piling up', { skip }, async () => {
    const upstream = await heldUpstream();
    const judge = await startJudge(upstream.url, 0.3);
    try {
        const first = ask(judge.base);
        assert.ok(await upstream.arrived(1), 'the first request holds the model');
        const second = await ask(judge.base);
        assert.equal(second.status, 503);
        assert.equal((await second.json()).busy, true);
        upstream.release();
        assert.equal((await first).status, 200);
        assert.equal(upstream.seen.length, 1);
        assert.deepEqual((await judge.health()).shed, { busy: 1, gone: 0 });
    } finally {
        upstream.release();
        judge.stop();
        await upstream.close();
    }
});
