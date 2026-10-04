import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const [action = 'status', profile] = process.argv.slice(2);
const configFile = process.env.SO_LOCAL_CONFIG ?? 'C:/dev/tools/story-orchestrator-local/config.json';
const config = JSON.parse(await fs.readFile(configFile, 'utf8'));
const url = `http://127.0.0.1:${config.gatewayPort}`;
if (action === 'start-st') {
    try { if ((await fetch('http://127.0.0.1:8000/', { signal: AbortSignal.timeout(1000) })).ok) { console.log('SillyTavern already running.'); process.exit(0); } } catch {}
    await fs.mkdir(config.stateDir, { recursive: true });
    const log = await fs.open(path.join(config.stateDir, 'sillytavern.log'), 'a');
    const child = spawn(process.execPath, ['server.js'], { cwd: config.stRoot ?? 'C:/dev/SillyTavern-MainBranch', detached: true, windowsHide: true, stdio: ['ignore', log.fd, log.fd] });
    child.unref(); await log.close();
    await fs.writeFile(path.join(config.stateDir, 'owned-st.json'), JSON.stringify({ pid: child.pid, startedAt: new Date().toISOString() }));
    const deadline = Date.now() + 60000;
    while (Date.now() < deadline) {
        try { if ((await fetch('http://127.0.0.1:8000/', { signal: AbortSignal.timeout(1000) })).ok) { console.log('SillyTavern started without pulling Git or altering user data.'); process.exit(0); } } catch {}
        await new Promise((resolve) => setTimeout(resolve, 1000));
    }
    throw new Error('SillyTavern did not become ready; read sillytavern.log.');
}
if (action === 'start') {
    try { const response = await fetch(`${url}/status`, { signal: AbortSignal.timeout(1000) }); if (response.ok) { console.log('Local controller already running.'); process.exit(0); } } catch {}
    await fs.mkdir(config.stateDir, { recursive: true });
    const log = await fs.open(path.join(config.stateDir, 'controller.log'), 'a');
    const child = spawn(process.execPath, [fileURLToPath(new URL('./controller.mjs', import.meta.url)), configFile], { detached: true, windowsHide: true, stdio: ['ignore', log.fd, log.fd] });
    child.unref(); await log.close();
    const deadline = Date.now() + 20000;
    while (Date.now() < deadline) {
        try { if ((await fetch(`${url}/status`, { signal: AbortSignal.timeout(1000) })).ok) { console.log('Local resource controller started; text loads on demand.'); process.exit(0); } } catch {}
        await new Promise((resolve) => setTimeout(resolve, 500));
    }
    throw new Error('Controller did not start. Read controller.log.');
}
const routes = { load: 'load', unload: 'unload', automatic: 'automatic', restore: 'restore', 'start-comfy': 'start-comfy', 'free-images': 'free-images', stop: 'stop' };
const response = await fetch(action === 'status' ? `${url}/status` : `${url}/control/${routes[action] ?? 'unknown'}`, action === 'status' ? { signal: AbortSignal.timeout(15000) } : { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(profile ? { profile } : {}), signal: AbortSignal.timeout(300000) });
const data = await response.json();
if (!response.ok) throw new Error(JSON.stringify(data));
if (action === 'status') {
    console.log(`${data.phase}; ${data.text.profile ?? 'text unloaded'}; GPU free ${Math.round(data.telemetry.gpus[0].freeMiB)} MiB; RAM free ${Math.round(data.telemetry.host.availableMiB)} MiB; queue ${data.waitingText}`);
    if (process.argv.includes('--json')) console.log(JSON.stringify(data, null, 2));
} else console.log(`${action}: ${data.phase ?? 'done'}`);
