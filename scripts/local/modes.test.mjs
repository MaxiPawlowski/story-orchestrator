import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { KNOBS, PRESETS, TOGGLE, changeConfigFile, checkValue, createLiveSettings, createSettingsReload, currentMode, defaultModes, knobValues, modesOf, planChange, resetPresets, serializeConfig } from './modes.mjs';
import { testTempDir } from '../lib/testTemp.mjs';

const install = () => ({
    backendPort: 18889, gatewayPort: 18888, stateDir: 'state', reserves: { gpuMiB: 2048, ramMiB: 4096 }, shedCeilingMiB: 13000, idleRestoreMs: 600000,
    profiles: { fast: { args: ['--ctx-size', '32768'] } }, defaultProfile: 'fast', comfyExtraArgs: ['--fast-disk'],
    streamImages: { enabled: true, minFreeGpuMiB: 2400, maxWeightMiB: 8192, kinds: ['checkpoints'] }, maxContext: 32768, fitMarginMiB: 512,
});

const temp = async (config) => {
    const dir = await testTempDir('so-modes-');
    const file = path.join(dir, 'config.json');
    await fs.writeFile(file, serializeConfig(config));
    return { dir, file, backupRoot: path.join(dir, 'backups') };
};

test('balanced is the config as it stands, so selecting it changes nothing', () => {
    const config = install();
    assert.equal(currentMode(config), 'balanced');
    const plan = planChange(config, { mode: 'balanced' });
    assert.deepEqual(plan.changed, []);
    assert.deepEqual(knobValues(plan.config), knobValues(config));
    const { modes, mode, ...rest } = plan.config;
    assert.deepEqual(rest, config);
    assert.equal(mode, 'balanced');
    assert.deepEqual(modes.balanced.reserves, { gpuMiB: 2048, ramMiB: 4096 });
    assert.equal(modes.balanced.keepTextResident, true);
    assert.equal(modes.balanced.imageCacheMode, 'warm');
});

test('every preset value is inside its knob bounds, and the presets keep the measured floors', () => {
    for (const preset of Object.values(PRESETS)) {
        assert.deepEqual(Object.keys(preset).sort(), KNOBS.map((row) => row.path).sort());
        for (const [key, value] of Object.entries(preset)) assert.equal(checkValue(key, value), null, key);
        assert.ok(preset.fitMarginMiB >= 512);
        assert.ok(preset['streamImages.minFreeGpuMiB'] >= 2400);
    }
    assert.ok(PRESETS.max['reserves.gpuMiB'] < 2048 && PRESETS.safe['reserves.gpuMiB'] > 2048);
    assert.equal(PRESETS.safe['streamImages.enabled'], false);
});

test('a mode patches only its own keys and keeps the rest of nested settings', () => {
    const plan = planChange(install(), { mode: 'safe' });
    assert.deepEqual(plan.config.streamImages, { enabled: false, minFreeGpuMiB: 2400, maxWeightMiB: 8192, kinds: ['checkpoints'] });
    assert.deepEqual(plan.config.reserves, { gpuMiB: 3072, ramMiB: 6144 });
    assert.equal(plan.config.shedCeilingMiB, 13000);
    assert.deepEqual(plan.config.comfyExtraArgs, ['--fast-disk']);
    assert.deepEqual(plan.changed.sort(), ['imageCacheMode', 'memberCache.budgetMiB', 'reserves.gpuMiB', 'reserves.ramMiB', 'streamImages.enabled'].sort());
    assert.deepEqual(plan.textLoad.sort(), ['memberCache.budgetMiB', 'reserves.gpuMiB']);
    assert.deepEqual(plan.config.memberCache, { budgetMiB: 2048 });
    assert.equal(currentMode(plan.config), 'safe');
});

test('custom values are validated, and values matching a preset are named after it', () => {
    assert.throws(() => planChange(install(), { values: { 'reserves.gpuMiB': 512 } }), /between 1024 and 8192/);
    assert.throws(() => planChange(install(), { values: { fitMarginMiB: 0 } }), /between 512/);
    assert.throws(() => planChange(install(), { values: { binary: 'evil.exe' } }), /not a performance setting/);
    assert.throws(() => planChange(install(), { values: { imageCacheMode: 'pinned' } }), /warm, evict/);
    assert.throws(() => planChange(install(), { mode: 'max', values: {} }), /either a mode or values/);
    assert.throws(() => planChange(install(), { mode: 'turbo' }), /Unknown mode/);
    const custom = planChange(install(), { values: { idleRestoreMs: 240000 } });
    assert.equal(custom.mode, 'custom');
    assert.deepEqual(custom.live, ['idleRestoreMs']);
    assert.equal(currentMode(custom.config), 'custom');
    const back = planChange(custom.config, { values: { idleRestoreMs: 600000 } });
    assert.equal(back.mode, 'balanced');
});

test('an owner-edited preset in config.json is used, and an invalid one is refused', () => {
    const config = { ...install(), modes: defaultModes(install()) };
    config.modes.max.idleRestoreMs = 120000;
    assert.equal(planChange(config, { mode: 'max' }).config.idleRestoreMs, 120000);
    config.modes.max.fitMarginMiB = 100;
    assert.throws(() => planChange(config, { mode: 'max' }), /Mode max in config.json/);
});

test('saving backs up the old file first and replaces it atomically', async () => {
    const { dir, file, backupRoot } = await temp(install());
    try {
        const before = await fs.readFile(file, 'utf8');
        const plan = await changeConfigFile(file, { mode: 'max' }, { backupRoot, now: 42 });
        assert.equal(await fs.readFile(plan.backup, 'utf8'), before);
        assert.equal(plan.backup, path.join(backupRoot, 'local-config-42', 'config.json'));
        const saved = JSON.parse(await fs.readFile(file, 'utf8'));
        assert.equal(saved.mode, 'max');
        assert.equal(saved.reserves.gpuMiB, 1024);
        assert.deepEqual((await fs.readdir(dir)).sort(), ['backups', 'config.json']);
        const again = await changeConfigFile(file, { mode: 'max' }, { backupRoot, now: 43 });
        assert.equal(again.backup, null);
    } finally { await fs.rm(dir, { recursive: true, force: true }); }
});

test('a failed backup writes nothing', async () => {
    const { dir, file } = await temp(install());
    try {
        const blocker = path.join(dir, 'blocked');
        await fs.writeFile(blocker, 'x');
        const before = await fs.readFile(file, 'utf8');
        await assert.rejects(changeConfigFile(file, { mode: 'safe' }, { backupRoot: blocker }));
        assert.equal(await fs.readFile(file, 'utf8'), before);
    } finally { await fs.rm(dir, { recursive: true, force: true }); }
});

const fakeScheduler = () => {
    const scheduler = { busy: false, async exclusive(run) { if (scheduler.busy) throw new Error('Wait for the active work before changing text residency.'); return run(); } };
    return scheduler;
};

test('live settings apply at once when idle, and wait for running work otherwise', async () => {
    const target = { ...install(), comfySupervise: true };
    const scheduler = fakeScheduler();
    scheduler.spill = { backoffMiB: 512 };
    const text = { pid: 9, loading: false, loads: 3 };
    const live = createLiveSettings({ target, scheduler: () => scheduler, backend: { status: () => text }, timers: false });
    const reservesBefore = target.reserves;
    assert.equal(await live.request(planChange(install(), { mode: 'max' })), 'now');
    assert.deepEqual(target.reserves, { gpuMiB: 1024, ramMiB: 2048 });
    assert.equal(scheduler.spill.backoffMiB, 0);
    assert.deepEqual(reservesBefore, { gpuMiB: 2048, ramMiB: 4096 });
    assert.equal(target.idleRestoreMs, 180000);
    assert.equal(target.comfySupervise, true);
    assert.equal(target.streamImages.maxWeightMiB, 8192);
    assert.deepEqual(live.status().atNextTextLoad.sort(), ['memberCache.budgetMiB', 'memberCache.fitRam', 'reserves.gpuMiB']);
    text.loads = 4;
    assert.deepEqual(live.status().atNextTextLoad, []);
    scheduler.busy = true;
    assert.equal(await live.request(planChange(install(), { mode: 'safe' })), 'after-current-work');
    assert.equal(target.streamImages.enabled, true);
    assert.deepEqual(live.status().pending, { mode: 'safe' });
    assert.equal(live.status().mode, 'max');
    assert.equal(await live.retry(), false);
    scheduler.busy = false;
    assert.equal(await live.retry(), true);
    assert.equal(target.streamImages.enabled, false);
    assert.equal(target.imageCacheMode, 'evict');
    assert.equal(live.status().pending, null);
    assert.equal(live.status().mode, 'safe');
});

test('a text-load setting changed while no text is loaded has nothing to wait for', async () => {
    const target = install();
    const live = createLiveSettings({ target, scheduler: () => fakeScheduler(), backend: { status: () => ({ pid: null, loading: false, loads: 0 }) }, timers: false });
    await live.request(planChange(install(), { values: { fitMarginMiB: 768 } }));
    assert.equal(target.fitMarginMiB, 768);
    assert.deepEqual(live.status().atNextTextLoad, []);
});

test('cli mode saves through the same backed-up path while the controller is down, and the probe reads grey', async () => {
    const { spawnSync } = await import('node:child_process');
    const net = await import('node:net');
    const port = await new Promise((resolve) => { const server = net.createServer().listen(0, '127.0.0.1', () => { const { port: free } = server.address(); server.close(() => resolve(free)); }); });
    const { dir, file, backupRoot } = await temp({ ...install(), gatewayPort: port });
    const cli = fileURLToPath(new URL('./cli.mjs', import.meta.url));
    const run = (...args) => spawnSync(process.execPath, [cli, ...args], { env: { ...process.env, SO_LOCAL_CONFIG: file, SO_LOCAL_BACKUP_ROOT: backupRoot }, encoding: 'utf8' });
    try {
        const probe = run('mode-probe');
        assert.equal(probe.status, 255);
        const show = run('mode');
        assert.equal(show.status, 0);
        assert.match(show.stdout, /Saved mode: Balanced; controller not running/);
        const set = run('mode', 'max');
        assert.equal(set.status, 0, set.stderr);
        assert.match(set.stdout, /Max mode saved \(backup .*local-config-\d+.config\.json\); applies when the controller starts\./);
        assert.equal(JSON.parse(await fs.readFile(file, 'utf8')).mode, 'max');
        assert.equal((await fs.readdir(backupRoot)).length, 1);
        assert.notEqual(run('mode', 'turbo').status, 0);
        assert.equal(JSON.parse(await fs.readFile(file, 'utf8')).mode, 'max');
    } finally { await fs.rm(dir, { recursive: true, force: true }); }
});

test('max is the default ceiling and headroom its toggle partner: headroom frees VRAM and RAM, max fits the cache to free RAM', () => {
    assert.deepEqual(TOGGLE, { max: 'headroom', headroom: 'max' });
    assert.equal(PRESETS.max['memberCache.fitRam'], true);
    assert.ok(PRESETS.max['memberCache.budgetMiB'] > 4096);
    assert.ok(PRESETS.headroom['reserves.gpuMiB'] >= PRESETS.max['reserves.gpuMiB'] + 2048);
    assert.ok(PRESETS.headroom['reserves.ramMiB'] > PRESETS.max['reserves.ramMiB']);
    assert.ok(PRESETS.headroom['memberCache.budgetMiB'] <= 2048);
    assert.equal(PRESETS.headroom['streamImages.enabled'], false);
    assert.equal(PRESETS.headroom.imageCacheMode, 'evict');
});

test('an owner config written before headroom existed gets the built-in headroom preset, and reset rewrites only the named presets', () => {
    const config = { ...install(), modes: { max: { reserves: { gpuMiB: 1024, ramMiB: 2048 }, memberCache: { budgetMiB: 4096 } }, balanced: {}, safe: {} } };
    assert.deepEqual(Object.keys(modesOf(config)), ['max', 'balanced', 'safe', 'headroom']);
    const plan = planChange(config, { mode: 'headroom' });
    assert.equal(plan.config.reserves.gpuMiB, 4096);
    assert.equal(plan.config.memberCache.budgetMiB, 2048);
    assert.equal(plan.config.modes.max.memberCache.budgetMiB, 4096);
    const reset = resetPresets(config, ['max']);
    assert.equal(reset.modes.max.memberCache.budgetMiB, PRESETS.max['memberCache.budgetMiB']);
    assert.equal(reset.modes.max.memberCache.fitRam, true);
    assert.deepEqual(reset.modes.balanced, {});
    assert.equal(config.modes.max.memberCache.budgetMiB, 4096);
    assert.throws(() => resetPresets(config, ['balanced']), /built-in presets/);
});

test('apply now is the only extra field a change accepts', () => {
    assert.equal(planChange(install(), { mode: 'headroom', apply: 'now' }).applyNow, true);
    assert.equal(planChange(install(), { mode: 'headroom' }).applyNow, false);
    assert.throws(() => planChange(install(), { mode: 'headroom', apply: 'later' }), /apply must be 'now'/);
});

test('apply now reloads inside the same exclusive turn as the values, and records what it freed', async () => {
    const target = install();
    const order = [];
    const scheduler = { async exclusive(run) { order.push('exclusive'); return run(); }, spill: null };
    const text = { pid: 9, loading: false, loads: 3 };
    const reload = async () => { order.push(`reload:${target.reserves.gpuMiB}`); text.loads += 1; return { text: 'reloaded', ms: 21000, gpuFreedMiB: 3000, ramFreedMiB: 7000 }; };
    const applied = [];
    const live = createLiveSettings({ target, scheduler: () => scheduler, backend: { status: () => text }, timers: false, reload, onApplied: (change) => applied.push(change.mode) });
    assert.equal(await live.request(planChange(install(), { mode: 'headroom', apply: 'now' })), 'now');
    assert.deepEqual(order, ['exclusive', 'reload:4096']);
    assert.equal(live.status().lastApply.gpuFreedMiB, 3000);
    assert.deepEqual(live.status().atNextTextLoad, []);
    assert.deepEqual(applied, ['headroom']);
    await live.request(planChange(install(), { mode: 'max' }));
    assert.deepEqual(order, ['exclusive', 'reload:4096', 'exclusive']);
});

test('a failed reload is recorded, and the values stay applied', async () => {
    const target = install();
    const scheduler = { async exclusive(run) { return run(); } };
    const live = createLiveSettings({ target, scheduler: () => scheduler, backend: { status: () => ({ pid: 9, loading: false, loads: 1 }) }, timers: false,
        reload: async () => { throw new Error('Not enough free GPU'); } });
    assert.equal(await live.request(planChange(install(), { mode: 'headroom', apply: 'now' })), 'now');
    assert.equal(target.reserves.gpuMiB, 4096);
    assert.equal(live.status().lastApply.text, 'failed');
    assert.match(live.status().lastApply.error, /Not enough free GPU/);
    assert.equal(live.status().mode, 'headroom');
});

const fakeReloadDeps = (state) => {
    const calls = [];
    let free = { gpu: 2000, ram: 9000 };
    const backend = {
        status: () => state,
        async dropSleeping() { calls.push('drop'); free = { gpu: free.gpu, ram: free.ram + 4000 }; return 4096; },
        async unload() { calls.push('unload'); },
        async load(name, options) { calls.push(`load:${name}:${options.fitTarget}`); free = { gpu: 4500, ram: 15000 }; },
    };
    const scheduler = { async freeImages(options) { calls.push(`free:${options.clear}`); } };
    const snapshot = async () => ({ gpus: [{ freeMiB: free.gpu }], host: { availableMiB: free.ram } });
    return { calls, backend, scheduler: () => scheduler, snapshot };
};

test('the settings reload restarts loaded text, drops a sleeping one, frees images, and reports the freed memory', async () => {
    const awake = fakeReloadDeps({ pid: 9, loading: false, fitTargetMiB: null, profile: 'fast', desiredProfile: 'fast', sleeping: null });
    const result = await createSettingsReload({ ...awake, target: { imageCacheMode: 'evict' } })();
    assert.deepEqual(awake.calls, ['free:true', 'unload', 'load:fast:null']);
    assert.equal(result.text, 'reloaded');
    assert.equal(result.gpuFreedMiB, 2500);
    assert.equal(result.ramFreedMiB, 6000);
    const asleep = fakeReloadDeps({ pid: null, loading: false, fitTargetMiB: null, profile: null, sleeping: { profile: 'fast' } });
    const slept = await createSettingsReload({ ...asleep, target: { imageCacheMode: 'warm' } })();
    assert.deepEqual(asleep.calls, ['drop', 'free:false']);
    assert.equal(slept.text, 'dropped-sleeping');
    const none = fakeReloadDeps({ pid: null, loading: false, fitTargetMiB: null, sleeping: null });
    assert.equal((await createSettingsReload({ ...none, target: {} })()).text, 'none');
    const shed = fakeReloadDeps({ pid: 9, loading: false, fitTargetMiB: 12000, profile: 'fast', sleeping: null });
    await createSettingsReload({ ...shed, target: {} })();
    assert.deepEqual(shed.calls, ['free:false']);
});

test('cli toggle flips max and headroom (anything else goes to max), and mode-reset rewrites a stale preset with a backup', async () => {
    const { spawnSync } = await import('node:child_process');
    const net = await import('node:net');
    const port = await new Promise((resolve) => { const server = net.createServer().listen(0, '127.0.0.1', () => { const { port: free } = server.address(); server.close(() => resolve(free)); }); });
    const stale = { ...install(), gatewayPort: port, modes: { max: { reserves: { gpuMiB: 1024, ramMiB: 2048 }, memberCache: { budgetMiB: 4096 } } } };
    const { dir, file, backupRoot } = await temp(stale);
    const cli = fileURLToPath(new URL('./cli.mjs', import.meta.url));
    const run = (...args) => spawnSync(process.execPath, [cli, ...args], { env: { ...process.env, SO_LOCAL_CONFIG: file, SO_LOCAL_BACKUP_ROOT: backupRoot }, encoding: 'utf8' });
    const saved = async () => JSON.parse(await fs.readFile(file, 'utf8'));
    try {
        assert.equal(run('mode', 'toggle').status, 0);
        assert.equal((await saved()).mode, 'max');
        assert.equal((await saved()).memberCache.budgetMiB, 4096);
        assert.equal(run('mode', 'toggle').status, 0);
        assert.equal((await saved()).mode, 'headroom');
        assert.equal((await saved()).reserves.gpuMiB, 4096);
        const reset = run('mode-reset', 'max');
        assert.equal(reset.status, 0, reset.stderr);
        assert.deepEqual((await saved()).modes.max.memberCache, { budgetMiB: PRESETS.max['memberCache.budgetMiB'], fitRam: true });
        assert.notEqual(run('mode-reset', 'balanced').status, 0);
        assert.equal(run('mode', 'toggle').status, 0);
        assert.equal((await saved()).memberCache.fitRam, true);
    } finally { await fs.rm(dir, { recursive: true, force: true }); }
});
