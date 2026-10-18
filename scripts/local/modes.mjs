import fs from 'node:fs/promises';
import path from 'node:path';
import { BACKUP_ROOT, preserve } from './backup.mjs';

export const MODE_NAMES = Object.freeze(['max', 'balanced', 'safe']);

export const KNOBS = Object.freeze([
    { path: 'reserves.gpuMiB', type: 'int', min: 1024, max: 8192, step: 256, applies: 'live+text-load', label: 'GPU headroom kept free',
        about: 'VRAM left for the desktop and other apps. Lower lets bigger images and reloads in; higher protects other apps but text can lose GPU layers at its next load.' },
    { path: 'reserves.ramMiB', type: 'int', min: 2048, max: 16384, step: 512, applies: 'live', label: 'RAM headroom kept free',
        about: 'Physical RAM left for other apps. Lower admits images and text reloads on a busy PC; higher makes them wait instead of squeezing your apps.' },
    { path: 'streamImages.enabled', type: 'bool', applies: 'live', label: 'Images stream beside text',
        about: 'SDXL renders next to the fully loaded text model (reply after an image ~25 s instead of 50-140 s), but VRAM dips to ~0.3-0.5 GiB free while rendering.' },
    { path: 'streamImages.minFreeGpuMiB', type: 'int', min: 2400, max: 8192, step: 100, applies: 'live', label: 'Free VRAM needed to stream',
        about: 'A stream starts only with this much VRAM free; below it the image swaps the text out. Lower than 2400 was never measured safe.' },
    { path: 'idleRestoreMs', type: 'int', min: 0, max: 3600000, step: 60000, applies: 'live', label: 'Restore full speed after idle (ms)',
        about: 'After an image slowed the text down, reload it at full speed once nothing ran this long (0 = never). Shorter = fast replies sooner; longer = fewer ~22 s reloads.' },
    { path: 'keepTextResident', type: 'bool', applies: 'live', label: 'Reload text automatically',
        about: 'Bring the text model back by itself after an image or a failed load. Off = it loads only when the next reply asks for it (that reply waits).' },
    { path: 'fitMarginMiB', type: 'int', min: 512, max: 2048, step: 128, applies: 'text-load', label: 'Text fit safety margin',
        about: 'Extra VRAM llama-server plans to leave on top of the GPU headroom. Below 512 the measured load undershot the 2 GiB reserve.' },
    { path: 'imageCacheMode', type: 'enum', values: ['warm', 'evict'], applies: 'live', label: 'Image cache after a render',
        about: 'warm keeps ComfyUI\'s cache in RAM (next image ~20 s); evict gives that RAM back to your apps (next image starts cold, ~30-40 s).' },
]);

const KNOB_DEFAULTS = Object.freeze({ keepTextResident: true, imageCacheMode: 'warm', fitMarginMiB: 0, idleRestoreMs: 0, 'streamImages.enabled': false, 'streamImages.minFreeGpuMiB': 2400 });

export const PRESET_NOTES = Object.freeze({
    max: 'Only playing: smaller desktop headroom, images stream beside text, full speed back after 3 idle minutes.',
    balanced: 'The values this install ran with before modes existed.',
    safe: 'Using the PC too: more VRAM and RAM left for your apps, images swap the text out, image cache returned after each render. Text may run slower.',
});

export const PRESETS = Object.freeze({
    max: Object.freeze({ 'reserves.gpuMiB': 1536, 'reserves.ramMiB': 3072, 'streamImages.enabled': true, 'streamImages.minFreeGpuMiB': 2400, idleRestoreMs: 180000, keepTextResident: true, fitMarginMiB: 512, imageCacheMode: 'warm' }),
    safe: Object.freeze({ 'reserves.gpuMiB': 3072, 'reserves.ramMiB': 6144, 'streamImages.enabled': false, 'streamImages.minFreeGpuMiB': 2400, idleRestoreMs: 600000, keepTextResident: true, fitMarginMiB: 512, imageCacheMode: 'evict' }),
});

const knob = (key) => KNOBS.find((row) => row.path === key);
const getPath = (object, key) => key.split('.').reduce((value, part) => (value && typeof value === 'object' ? value[part] : undefined), object);

function setPath(object, key, value) {
    const parts = key.split('.');
    let at = object;
    for (const part of parts.slice(0, -1)) {
        if (!at[part] || typeof at[part] !== 'object' || Array.isArray(at[part])) at[part] = {};
        at = at[part];
    }
    at[parts[parts.length - 1]] = value;
}

export function knobValues(config) {
    return Object.fromEntries(KNOBS.map((row) => {
        const value = getPath(config, row.path);
        return [row.path, value === undefined ? KNOB_DEFAULTS[row.path] : value];
    }));
}

export function checkValue(key, value) {
    const row = knob(key);
    if (!row) return `${key} is not a performance setting.`;
    if (row.type === 'bool') return typeof value === 'boolean' ? null : `${key} must be true or false.`;
    if (row.type === 'enum') return row.values.includes(value) ? null : `${key} must be one of ${row.values.join(', ')}.`;
    if (!Number.isInteger(value)) return `${key} must be a whole number.`;
    if (value < row.min || value > row.max) return `${key} must be between ${row.min} and ${row.max}.`;
    return null;
}

export function flattenPatch(patch, prefix = '') {
    const out = {};
    for (const [key, value] of Object.entries(patch ?? {})) {
        if (key.startsWith('_')) continue;
        const full = prefix ? `${prefix}.${key}` : key;
        if (value && typeof value === 'object' && !Array.isArray(value) && !knob(full)) Object.assign(out, flattenPatch(value, full));
        else out[full] = value;
    }
    return out;
}

export function nestPatch(values) {
    const out = {};
    for (const [key, value] of Object.entries(values)) setPath(out, key, value);
    return out;
}

export function validateValues(values) {
    const errors = Object.entries(values).map(([key, value]) => checkValue(key, value)).filter(Boolean);
    if (errors.length) throw new Error(errors.join(' '));
    return values;
}

export function defaultModes(config) {
    const current = knobValues(config);
    return {
        max: { _note: PRESET_NOTES.max, ...nestPatch(PRESETS.max) },
        balanced: { _note: PRESET_NOTES.balanced, ...nestPatch(Object.fromEntries(Object.entries(current).filter(([key, value]) => !checkValue(key, value)))) },
        safe: { _note: PRESET_NOTES.safe, ...nestPatch(PRESETS.safe) },
    };
}

export function modesOf(config) {
    return config.modes && typeof config.modes === 'object' ? config.modes : defaultModes(config);
}

export function presetValues(config, name) {
    const preset = modesOf(config)[name];
    if (!preset || typeof preset !== 'object') throw new Error(`Unknown mode ${name}; pick ${MODE_NAMES.join(', ')} or adjust single settings.`);
    const values = flattenPatch(preset);
    for (const key of Object.keys(values)) { const problem = checkValue(key, values[key]); if (problem) throw new Error(`Mode ${name} in config.json: ${problem}`); }
    return values;
}

export function currentMode(config) {
    const stored = typeof config.mode === 'string' ? config.mode : 'balanced';
    if (stored === 'custom') return 'custom';
    let preset;
    try { preset = presetValues(config, stored); } catch { return 'custom'; }
    const values = knobValues(config);
    return Object.entries(preset).every(([key, value]) => values[key] === value) ? stored : 'custom';
}

export function planChange(config, request) {
    const input = request && typeof request === 'object' && !Array.isArray(request) ? request : {};
    const extra = Object.keys(input).filter((key) => !['mode', 'values'].includes(key));
    if (extra.length) throw new Error(`Unknown field ${extra.join(', ')}; send a mode or values.`);
    if ((input.mode === undefined) === (input.values === undefined)) throw new Error('Send either a mode or values, not both.');
    const before = knobValues(config);
    const next = structuredClone(config);
    next.modes = modesOf(config);
    let values;
    if (input.mode !== undefined) {
        if (typeof input.mode !== 'string' || !MODE_NAMES.includes(input.mode) && !Object.hasOwn(next.modes, input.mode)) throw new Error(`Unknown mode; pick ${MODE_NAMES.join(', ')}.`);
        values = presetValues(next, input.mode);
    } else {
        if (!input.values || typeof input.values !== 'object' || Array.isArray(input.values)) throw new Error('values must be an object of setting: value.');
        values = validateValues(flattenPatch(input.values));
    }
    for (const [key, value] of Object.entries(values)) if (getPath(next, key) !== undefined || value !== KNOB_DEFAULTS[key]) setPath(next, key, value);
    next.mode = input.mode ?? 'custom';
    if (next.mode === 'custom') for (const name of Object.keys(next.modes)) if (currentMode({ ...next, mode: name }) === name) next.mode = name;
    const after = knobValues(next);
    const changed = KNOBS.filter((row) => before[row.path] !== after[row.path]).map((row) => row.path);
    return { config: next, mode: next.mode, values: after, changed,
        live: changed.filter((key) => knob(key).applies.startsWith('live')), textLoad: changed.filter((key) => knob(key).applies.endsWith('text-load')) };
}

export function serializeConfig(config) {
    return `${JSON.stringify(config, null, 2)}\n`;
}

export async function saveConfig(configFile, config, { backupRoot = process.env.SO_LOCAL_BACKUP_ROOT ?? BACKUP_ROOT, now = Date.now() } = {}) {
    const target = path.join(backupRoot, `local-config-${now}`);
    const copied = await preserve([[configFile, 'config.json']], target);
    if (!copied.length) throw new Error(`Could not back up ${configFile}; nothing was written.`);
    const temporary = `${configFile}.${process.pid}.${now}.tmp`;
    await fs.writeFile(temporary, serializeConfig(config), { flag: 'wx' });
    try { await fs.rename(temporary, configFile); }
    catch (error) { await fs.rm(temporary, { force: true }); throw error; }
    return path.join(target, 'config.json');
}

export async function changeConfigFile(configFile, request, options = {}) {
    const config = JSON.parse(await fs.readFile(configFile, 'utf8'));
    const plan = planChange(config, request);
    plan.backup = plan.changed.length || config.mode !== plan.mode || !config.modes ? await saveConfig(configFile, plan.config, options) : null;
    return plan;
}

export function applyValues(target, values) {
    for (const [key, value] of Object.entries(values)) {
        if (key.includes('.')) {
            const [head] = key.split('.');
            target[head] = { ...(target[head] ?? {}) };
        }
        setPath(target, key, value);
    }
}

export function createLiveSettings({ target, scheduler, backend, mode = 'balanced', intervalMs = 1000, timers = true }) {
    let pending = null;
    let textLoad = null;
    let timer = null;
    const state = { applied: mode };
    const tryApply = async () => {
        if (!pending) return true;
        const change = pending;
        try {
            await scheduler().exclusive(async () => { applyValues(target, change.values); });
        } catch (error) {
            if (/Wait for the active work/.test(error.message)) return false;
            throw error;
        }
        if (pending === change) pending = null;
        state.applied = change.mode;
        state.appliedAt = new Date().toISOString();
        if (change.textLoad.length) {
            const text = backend.status();
            textLoad = text.pid || text.loading ? { keys: change.textLoad, loads: text.loads } : null;
        }
        return true;
    };
    const schedule = () => {
        if (timer || !timers) return;
        timer = setInterval(() => {
            void tryApply().then((done) => { if (done && timer) { clearInterval(timer); timer = null; } }, (error) => { state.lastError = error.message; });
        }, intervalMs);
        timer.unref?.();
    };
    return {
        async request(plan) {
            pending = { mode: plan.mode, values: plan.values, textLoad: plan.textLoad };
            const done = await tryApply();
            if (!done) schedule();
            return done ? 'now' : 'after-current-work';
        },
        retry: tryApply,
        status() {
            const text = backend.status();
            if (textLoad && text.loads !== textLoad.loads) textLoad = null;
            return { mode: state.applied, appliedAt: state.appliedAt ?? null, effective: knobValues(target), pending: pending ? { mode: pending.mode } : null,
                atNextTextLoad: textLoad?.keys ?? [], lastError: state.lastError ?? null };
        },
        stop() { if (timer) clearInterval(timer); timer = null; },
    };
}
