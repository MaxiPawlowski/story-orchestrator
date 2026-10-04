import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';

const configFile = process.argv[2];
if (!configFile) throw new Error('Usage: node scripts/local/live-check.mjs <config.json> [--idle]');
const config = JSON.parse(await fs.readFile(configFile, 'utf8'));
const url = `http://127.0.0.1:${config.gatewayPort}`;
const get = async (route) => {
    const response = await fetch(`${url}${route}`, { signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw new Error(`${route}: ${response.status}`);
    return response.json();
};
const post = async (route, body) => {
    const response = await fetch(`${url}${route}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(300000) });
    const data = await response.json();
    if (!response.ok) throw new Error(`${route}: ${JSON.stringify(data)}`);
    return data;
};
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const result = { at: new Date().toISOString(), before: await get('/status'), checks: [] };
try {
    assert.equal(result.before.activeText, 0);
    assert.equal(result.before.imageLease, false);
    const comfy = await (await fetch(`${config.comfyUrl}/queue`)).json();
    assert.equal(comfy.queue_running.length + comfy.queue_pending.length, 0);
    await post('/control/free-images', { clear: true });
    await post('/control/load', { profile: 'fast', fitTarget: 11107 });
    const shed = await get('/status');
    assert.equal(shed.text.fitTargetMiB, 11107);
    await get('/slots');
    await post('/tokenize', { content: 'A quiet stone hall.', add_special: true });
    const auxiliary = await get('/status');
    assert.equal(auxiliary.text.pid, shed.text.pid);
    assert.equal(auxiliary.text.loads, shed.text.loads);
    assert.equal(auxiliary.text.fitTargetMiB, shed.text.fitTargetMiB);
    const reply = await post('/completion', { prompt: '<|turn>user\nName one item in a stone hall.<turn|>\n<|turn>model\n<|channel>final\n', n_predict: 16, temperature: 0.6, seed: 17, cache_prompt: true });
    assert.ok(reply.content?.trim());
    const read = await get('/status');
    assert.equal(read.text.pid, shed.text.pid);
    result.checks.push({ id: 'auxiliary-and-real-read-preserve-shed', shed, auxiliary, after: read, replyLength: reply.content.length, timings: reply.timings });
    if (process.argv.includes('--cost')) {
        const began = Date.now();
        const longReply = await post('/completion', { prompt: '<|turn>user\nDescribe the stone hall and its furnishings in detail.<turn|>\n<|turn>model\n<|channel>final\n', n_predict: 256, temperature: 0.6, seed: 17, cache_prompt: true });
        assert.ok(longReply.content?.trim());
        const state = await get('/status');
        assert.equal(state.lastTextDecision.restore, true);
        assert.equal(state.text.fitTargetMiB, null);
        assert.notEqual(state.text.pid, shed.text.pid);
        result.checks.push({ id: 'measured-cost-restores-for-long-reply', elapsedMs: Date.now() - began, state, replyLength: longReply.content.length, timings: longReply.timings });
    }
    if (process.argv.includes('--idle')) {
        const lease = await post('/lease', { needGpuMiB: 1, needRamMiB: 0 });
        assert.equal(lease.decision, 'retain-text');
        await post('/release', { lease: lease.lease });
        const began = Date.now();
        const deadline = began + config.idleRestoreMs + 120000;
        let restored;
        while (Date.now() < deadline) {
            const state = await get('/status');
            if (state.text.fitTargetMiB === null && state.text.pid && !state.text.loading) { restored = state; break; }
            await sleep(1000);
        }
        assert.ok(restored, 'The configured idle restore did not finish.');
        assert.ok(Date.now() - began >= config.idleRestoreMs - 2500, 'The idle restore fired too early.');
        result.checks.push({ id: 'configured-idle-restore', elapsedMs: Date.now() - began, restored });
    } else {
        await post('/control/restore', {});
        const restored = await get('/status');
        assert.equal(restored.text.fitTargetMiB, null);
        assert.notEqual(restored.text.pid, shed.text.pid);
        result.checks.push({ id: 'explicit-full-restore', restored });
    }
    result.ok = true;
} catch (error) { result.ok = false; result.error = error.message; }
finally {
    result.after = await get('/status').catch(() => null);
    const record = path.join(process.env.SO_LOCAL_RECORD_DIR ?? config.stateDir, `live-check-${Date.now()}.json`);
    await fs.writeFile(record, JSON.stringify(result, null, 2));
    console.log(JSON.stringify({ record, ...result }, null, 2));
}
if (!result.ok) process.exitCode = 1;
