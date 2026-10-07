import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { applyInstall, compareVersions, planInstall, pluginVersions, SERVER_PLUGINS } from './pluginInstall.mjs';

const PLUGINS = { 'story-orchestrator-judge': ['package.json', 'index.mjs'], 'story-orchestrator-harness': ['package.json', 'index.mjs'] };

const fixture = () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'so-plugin-install-'));
    const extensionRoot = path.join(root, 'ext');
    const stRoot = path.join(root, 'st');
    for (const [name, version] of [['story-orchestrator-judge', '1.4.0'], ['story-orchestrator-harness', '1.1.0']]) {
        const dir = path.join(extensionRoot, 'server-plugin', name);
        fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name, version }));
        fs.writeFileSync(path.join(dir, 'index.mjs'), `export const PLUGIN_VERSION = '${version}';\n`);
    }
    fs.mkdirSync(path.join(stRoot, 'plugins'), { recursive: true });
    return { extensionRoot, stRoot };
};

const install = (stRoot, name, version, body = 'old') => {
    const dir = path.join(stRoot, 'plugins', name);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name, version }));
    fs.writeFileSync(path.join(dir, 'index.mjs'), body);
};

test('CR-J5: versions compare numerically', () => {
    assert.equal(compareVersions('1.10.0', '1.9.0'), 1);
    assert.equal(compareVersions('1.2.0', '1.2.0'), 0);
    assert.equal(compareVersions('1.2', '1.2.1'), -1);
});

test('CR-J5: installs both plugins, then a second run changes nothing', () => {
    const { extensionRoot, stRoot } = fixture();
    const first = applyInstall(planInstall({ extensionRoot, stRoot, plugins: PLUGINS }));
    assert.deepEqual(first.map((row) => [row.name, row.action, row.copied.length]), [['story-orchestrator-judge', 'install', 2], ['story-orchestrator-harness', 'install', 2]]);
    const second = applyInstall(planInstall({ extensionRoot, stRoot, plugins: PLUGINS }));
    assert.deepEqual(second.map((row) => [row.action, row.copied.length, row.installedVersion]), [['unchanged', 0, '1.4.0'], ['unchanged', 0, '1.1.0']]);
});

test('CR-J5: an older install is upgraded; a newer one is refused unless forced', () => {
    const { extensionRoot, stRoot } = fixture();
    install(stRoot, 'story-orchestrator-judge', '1.2.0');
    install(stRoot, 'story-orchestrator-harness', '9.0.0', 'newer');
    const plan = planInstall({ extensionRoot, stRoot, plugins: PLUGINS });
    assert.deepEqual(plan.map((row) => [row.action, row.installedVersion, row.sourceVersion]), [['upgrade', '1.2.0', '1.4.0'], ['refuse-downgrade', '9.0.0', '1.1.0']]);
    const applied = applyInstall(plan);
    assert.equal(applied[1].copied.length, 0);
    assert.equal(fs.readFileSync(path.join(stRoot, 'plugins', 'story-orchestrator-harness', 'index.mjs'), 'utf-8'), 'newer');
    assert.match(fs.readFileSync(path.join(stRoot, 'plugins', 'story-orchestrator-judge', 'index.mjs'), 'utf-8'), /1\.4\.0/);
    const forced = applyInstall(planInstall({ extensionRoot, stRoot, plugins: PLUGINS }), { force: true });
    assert.equal(forced[1].copied.length, 2);
    assert.match(fs.readFileSync(path.join(stRoot, 'plugins', 'story-orchestrator-harness', 'index.mjs'), 'utf-8'), /1\.1\.0/);
});

test('CR-J5: the repo\'s real plugin list matches what ships in server-plugin/', async () => {
    const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'server-plugin');
    assert.deepEqual(Object.keys(SERVER_PLUGINS).sort(), fs.readdirSync(repo).filter((name) => fs.statSync(path.join(repo, name)).isDirectory()).sort());
    for (const [name, files] of Object.entries(SERVER_PLUGINS)) for (const file of files) assert.ok(fs.existsSync(path.join(repo, name, file)), `${name}/${file}`);
});

test('release plugin versions include media and match every registered package', () => {
    const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
    const versions = pluginVersions(root);
    assert.ok(versions['story-orchestrator-media']);
    for (const name of Object.keys(SERVER_PLUGINS)) {
        assert.equal(versions[name], JSON.parse(fs.readFileSync(path.join(root, 'server-plugin', name, 'package.json'), 'utf8')).version);
    }
});
