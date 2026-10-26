import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { KNOBS, PRESETS, changeConfigFile, checkValue, createLiveSettings, currentMode, defaultModes, knobValues, planChange, serializeConfig } from './modes.mjs';

const install = () => ({
    backendPort: 18889, gatewayPort: 18888, stateDir: 'state', reserves: { gpuMiB: 2048, ramMiB: 4096 }, shedCeilingMiB: 13000, idleRestoreMs: 600000,
    profiles: { fast: { args: ['--ctx-size', '32768'] } }, defaultProfile: 'fast', comfyExtraArgs: ['--fast-disk'],
    streamImages: { enabled: true, minFreeGpuMiB: 2400, maxWeightMiB: 8192, kinds: ['checkpoints'] }, maxContext: 32768, fitMarginMiB: 512,
});

const temp = async (config) => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'so-modes-'));
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
        assert.equal(saved.reserves.gpuMiB, 1536);
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
    assert.deepEqual(target.reserves, { gpuMiB: 1536, ramMiB: 3072 });
    assert.equal(scheduler.spill.backoffMiB, 0);
    assert.deepEqual(reservesBefore, { gpuMiB: 2048, ramMiB: 4096 });
    assert.equal(target.idleRestoreMs, 180000);
    assert.equal(target.comfySupervise, true);
    assert.equal(target.streamImages.maxWeightMiB, 8192);
    assert.deepEqual(live.status().atNextTextLoad, ['reserves.gpuMiB']);
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
