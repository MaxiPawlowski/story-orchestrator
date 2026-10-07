import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { connectToST } from './lib/connection.mts';
import { ensureSTReady } from './lib/st-ready.mts';
import { evaluateInST } from './lib/evaluate.mts';

const configFile = process.argv[2];
if (!configFile || !/^http:\/\/127\.0\.0\.1:81\d[1-9]\//.test(process.env.ST_URL ?? '')) throw new Error('Use an isolated lane and supply its local-controller config.');
const config = JSON.parse(await fs.readFile(configFile, 'utf8'));
const gateway = `http://127.0.0.1:${config.gatewayPort}`;
const outputDir = path.resolve('test/measurements/v2.7/flux-memory');
const connection = await connectToST();
const { page, browser } = connection;
const report: Record<string, unknown> = { at: new Date().toISOString(), laneUrl: process.env.ST_URL };
let child: ReturnType<typeof spawn> | undefined;
let completion: Promise<number | null> | undefined;
try {
    await ensureSTReady(page);
    report.before = await (await fetch(`${gateway}/status`)).json();
    const profile = await evaluateInST(page, async () => {
        const ctx = (globalThis as any).SillyTavern.getContext();
        const profiles = ctx.extensionSettings.connectionManager?.profiles;
        if (!Array.isArray(profiles)) throw new Error('Connection Manager profiles unavailable.');
        const selected = profiles.find((row: any) => row.name === 'Story Orchestrator Memory Unsloth');
        if (!selected) throw new Error('The lane lacks the local memory profile.');
        (globalThis as any).__soFluxProfile = { id: selected.id, api: selected.api };
        selected.api = 'llamacpp';
        const response = await fetch('/api/plugins/story-orchestrator-gpu/status', { headers: ctx.getRequestHeaders() });
        const status = await response.json();
        if (!response.ok || status.adapter !== 'managed') throw new Error('The ST GPU plugin does not route to the managed controller.');
        return { id: selected.id, plugin: status.adapter, url: selected['api-url'] };
    });
    report.profile = profile;
    child = spawn(process.execPath, ['scripts/local/render-benchmark.mjs', configFile, 'auto', 'background', '128', '--summary'],
        { env: { ...process.env, SO_LOCAL_RECORD_DIR: outputDir }, stdio: ['ignore', 'pipe', 'pipe'] });
    let log = '';
    child.stdout?.on('data', (chunk) => { log += chunk.toString(); });
    child.stderr?.on('data', (chunk) => { log += chunk.toString(); });
    completion = new Promise((resolve, reject) => { child?.once('exit', resolve); child?.once('error', reject); });
    const deadline = Date.now() + 180000;
    let state;
    while (Date.now() < deadline) {
        state = await (await fetch(`${gateway}/status`)).json();
        if (state.imageLease) break;
        if (child.exitCode !== null) throw new Error('Render stopped before a GPU lease was observed.');
        await new Promise((resolve) => setTimeout(resolve, 100));
    }
    if (!state?.imageLease) throw new Error('No image lease was observed.');
    report.during = state;
    const began = Date.now();
    const read = evaluateInST(page, async (id) => {
        const modulePath = '/scripts/extensions/shared.js';
        const mod = await import(modulePath);
        const reply = await mod.ConnectionManagerRequestService.sendRequest(id,
            '<|turn>user\nName one item in a stone hall.<turn|>\n<|turn>model\n<|channel>final\n', 16,
            { extractData: true, includePreset: false, includeInstruct: false, stream: false }, {});
        const text = typeof reply === 'string' ? reply : reply?.content;
        if (typeof text !== 'string' || !text.trim()) throw new Error('The real ST memory-profile request answered without text.');
        return { length: text.length };
    }, profile.id);
    let readFailure: unknown;
    void read.catch((error) => { readFailure = error; });
    let queued = false;
    for (let attempt = 0; attempt < 100; attempt++) {
        if (readFailure) throw readFailure;
        const current = await (await fetch(`${gateway}/status`)).json();
        if (current.imageLease && current.waitingText > 0 && current.activeText === 0) { queued = true; break; }
        await new Promise((resolve) => setTimeout(resolve, 100));
    }
    if (!queued) throw new Error('The ST read was not observed queued behind the image.');
    report.queued = true;
    report.read = await read;
    report.readElapsedMs = Date.now() - began;
    const code = await completion;
    report.renderLog = log;
    if (code !== 0) throw new Error('The real FLUX cycle failed; see renderLog.');
    report.after = await (await fetch(`${gateway}/status`)).json();
    report.ok = true;
} catch (error) { report.ok = false; report.error = error instanceof Error ? error.message : String(error); }
finally {
    await evaluateInST(page, () => {
        const g = globalThis as any;
        const prior = g.__soFluxProfile;
        if (prior) {
            const profiles = g.SillyTavern.getContext().extensionSettings.connectionManager.profiles;
            const selected = profiles.find((row: any) => row.id === prior.id);
            if (selected) selected.api = prior.api;
            delete g.__soFluxProfile;
        }
    }).catch(() => { report.restoreFailed = true; });
    if (completion) await completion.catch(() => {});
    const output = path.join(outputDir, `st-local-transport-${Date.now()}.json`);
    await fs.writeFile(output, JSON.stringify(report, null, 2));
    await browser.close();
    console.log(JSON.stringify({ output, ok: report.ok, error: report.error }));
}
if (!report.ok || report.restoreFailed) process.exitCode = 1;
