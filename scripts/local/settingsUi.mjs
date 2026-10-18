import fs from 'node:fs/promises';
import { KNOBS, MODE_NAMES, PRESET_NOTES, changeConfigFile, currentMode, knobValues, modesOf, presetValues } from './modes.mjs';
import { readBody } from '../../server-plugin/story-orchestrator-gpu/broker/gateway.mjs';

const PAGE = new URL('./settingsPage.html', import.meta.url);
const SCRIPT = new URL('./settingsPage.js', import.meta.url);
const SECURITY = { 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', 'x-frame-options': 'DENY', 'referrer-policy': 'no-referrer',
    'content-security-policy': "default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'" };
export const UI_HEADER = 'x-so-local-ui';

const send = (res, status, type, body) => {
    res.writeHead(status, { 'content-type': type, ...SECURITY });
    res.end(body);
};
const json = (res, status, data) => send(res, status, 'application/json', JSON.stringify(data));

export function loopbackHosts(port) {
    return new Set([`127.0.0.1:${port}`, `localhost:${port}`]);
}

export function requestCheck(req, port) {
    const hosts = loopbackHosts(port);
    if (!hosts.has(String(req.headers.host ?? '').toLowerCase())) return 'The settings page answers only on 127.0.0.1.';
    if (req.method === 'GET') return null;
    const origin = req.headers.origin;
    if (origin !== undefined && ![...hosts].some((host) => String(origin).toLowerCase() === `http://${host}`)) return 'Cross-origin settings changes are refused.';
    if (req.headers[UI_HEADER] !== '1') return `Settings changes need the ${UI_HEADER} header.`;
    if (!String(req.headers['content-type'] ?? '').startsWith('application/json')) return 'Settings changes must be JSON.';
    return null;
}

export function describeModes(config) {
    const modes = modesOf(config);
    return Object.keys(modes).map((name) => {
        let values = null;
        let error = null;
        try { values = presetValues(config, name); } catch (problem) { error = problem.message; }
        return { name, note: modes[name]?._note ?? PRESET_NOTES[name] ?? '', values, error, builtIn: MODE_NAMES.includes(name) };
    });
}

export function createSettingsRoutes({ configFile, port, live, telemetry, backupRoot }) {
    const readConfig = async () => JSON.parse(await fs.readFile(configFile, 'utf8'));
    const state = async () => {
        const config = await readConfig();
        let reading = null;
        try { reading = await telemetry(); } catch {}
        return { configMode: currentMode(config), saved: knobValues(config), modes: describeModes(config), knobs: KNOBS, live: live.status(),
            gpuFreeMiB: reading?.gpus?.[0]?.freeMiB ?? null, gpuTotalMiB: reading?.gpus?.[0]?.totalMiB ?? null,
            ramAvailableMiB: reading?.host?.availableMiB ?? null, phase: reading?.phase ?? null };
    };
    let writing = Promise.resolve();
    const change = (body) => {
        const run = writing.then(async () => {
            const plan = await changeConfigFile(configFile, body, backupRoot ? { backupRoot } : {});
            const applied = await live.request(plan);
            return { mode: plan.mode, changed: plan.changed, live: plan.live, atNextTextLoad: plan.textLoad, applied, backup: plan.backup };
        });
        writing = run.catch(() => {});
        return run;
    };
    return async function handle(req, res, route) {
        if (route !== '/ui' && !route.startsWith('/ui/')) return false;
        const refused = requestCheck(req, port);
        if (refused) { json(res, 403, { error: refused }); return true; }
        try {
            if (req.method === 'GET' && (route === '/ui' || route === '/ui/')) { send(res, 200, 'text/html; charset=utf-8', await fs.readFile(PAGE)); return true; }
            if (req.method === 'GET' && route === '/ui/app.js') { send(res, 200, 'text/javascript; charset=utf-8', await fs.readFile(SCRIPT)); return true; }
            if (req.method === 'GET' && route === '/ui/api/state') { json(res, 200, await state()); return true; }
            if (req.method === 'POST' && route === '/ui/api/change') { json(res, 200, await change(await readBody(req, 64 * 1024))); return true; }
            json(res, 404, { error: 'Unknown settings route.' });
        } catch (error) { json(res, 400, { error: error.message }); }
        return true;
    };
}
