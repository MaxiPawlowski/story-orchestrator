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
if (action === 'mode' || action === 'mode-probe') {
    const { changeConfigFile, currentMode, knobValues, MODE_NAMES } = await import('./modes.mjs');
    const title = (name) => name.charAt(0).toUpperCase() + name.slice(1);
    const live = async () => {
        try {
            const reply = await fetch(`${url}/status`, { signal: AbortSignal.timeout(6000) });
            return reply.ok ? { up: true, performance: (await reply.json()).performance ?? null } : { up: false };
        } catch { return { up: false }; }
    };
    if (action === 'mode-probe') {
        const state = await live();
        if (!state.up) { console.error('Controller is not running.'); process.exit(255); }
        if (!state.performance) { console.log(`${title(currentMode(config))} (saved)`); console.error('This controller build predates modes; the saved mode applies at its next start.'); process.exit(0); }
        const { mode, pending, atNextTextLoad } = state.performance;
        if (pending) { console.log(`${title(pending.mode)} (waiting)`); console.error('Applies when the current text or image job finishes.'); process.exit(2); }
        console.log(title(mode));
        if (atNextTextLoad.length) console.error(`${atNextTextLoad.join(', ')} apply at the next text load.`);
        process.exit(0);
    }
    if (!profile) {
        const state = await live();
        console.log(`Saved mode: ${title(currentMode(config))}${state.performance ? `; running: ${title(state.performance.mode)}` : state.up ? '; running controller predates modes' : '; controller not running'}`);
        for (const [key, value] of Object.entries(state.performance?.effective ?? knobValues(config))) console.log(`  ${key} = ${value}`);
        console.log(`Set with: node scripts/local/cli.mjs mode ${MODE_NAMES.join('|')}`);
        process.exit(0);
    }
    let reply = null;
    try {
        reply = await fetch(`${url}/ui/api/change`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-so-local-ui': '1' }, body: JSON.stringify({ mode: profile }), signal: AbortSignal.timeout(30000) });
    } catch {}
    if (reply?.ok) {
        const data = await reply.json();
        console.log(`${title(data.mode)} mode ${data.applied === 'now' ? 'applied' : 'saved; applies when the current job finishes'}${data.atNextTextLoad.length ? `; ${data.atNextTextLoad.join(', ')} at the next text load` : ''}.`);
        process.exit(0);
    }
    if (reply && reply.status !== 404) throw new Error((await reply.json().catch(() => ({}))).error ?? `Controller answered ${reply.status}`);
    const plan = await changeConfigFile(configFile, { mode: profile });
    console.log(`${title(plan.mode)} mode saved${plan.backup ? ` (backup ${plan.backup})` : ''}; ${reply ? 'the running controller predates modes and applies it at its next start' : 'applies when the controller starts'}.`);
    process.exit(0);
}
const routes = { load: 'load', unload: 'unload', automatic: 'automatic', restore: 'restore', 'cache-mode': 'cache-mode', 'start-comfy': 'start-comfy', 'free-images': 'free-images', stop: 'stop' };
const response = await fetch(action === 'status' ? `${url}/status` : `${url}/control/${routes[action] ?? 'unknown'}`, action === 'status' ? { signal: AbortSignal.timeout(15000) } : { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(profile ? { profile } : {}), signal: AbortSignal.timeout(300000) });
const data = await response.json();
if (!response.ok) throw new Error(JSON.stringify(data));
if (action === 'status') {
    console.log(`${data.phase}; ${data.text.profile ?? 'text unloaded'}; GPU free ${Math.round(data.telemetry.gpus[0].freeMiB)} MiB; RAM free ${Math.round(data.telemetry.host.availableMiB)} MiB; queue ${data.waitingText}`);
    if (process.argv.includes('--json')) console.log(JSON.stringify(data, null, 2));
} else console.log(`${action}: ${data.phase ?? 'done'}`);
