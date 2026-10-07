import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { applyInstall, planInstall, pluginVersions, selectedPlugins, SERVER_PLUGINS, shippedFiles } from './pluginInstall.mjs';

const PLUGINS = ['story-orchestrator-judge', 'story-orchestrator-harness'];

const write = (file, body) => {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, body);
};

const fixture = () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'so-plugin-install-'));
    const extensionRoot = path.join(root, 'ext');
    const stRoot = path.join(root, 'st');
    for (const [name, version] of [['story-orchestrator-judge', '1.4.0'], ['story-orchestrator-harness', '1.1.0']]) {
        const dir = path.join(extensionRoot, 'server-plugin', name);
        write(path.join(dir, 'package.json'), JSON.stringify({ name, version }));
        write(path.join(dir, 'index.mjs'), `export const PLUGIN_VERSION = '${version}';\n`);
        write(path.join(dir, 'lib', 'helper.mjs'), 'export const helper = 1;\n');
        write(path.join(dir, 'plugin.test.mjs'), 'test\n');
        write(path.join(dir, 'lib', 'helper.test.mjs'), 'test\n');
        write(path.join(dir, 'README.md'), '# readme\n');
        write(path.join(dir, 'fixtures', 'fake.mjs'), 'fake\n');
        write(path.join(dir, 'node_modules', 'dep', 'index.js'), 'dep\n');
        write(path.join(dir, 'config.json'), '{"source":true}\n');
    }
    fs.mkdirSync(path.join(stRoot, 'plugins'), { recursive: true });
    return { extensionRoot, stRoot };
};

const target = (stRoot, name, file) => path.join(stRoot, 'plugins', name, file);

test('shipped files leave out tests, README.md, fixtures/, node_modules/ and config.json', () => {
    const { extensionRoot } = fixture();
    assert.deepEqual(shippedFiles(path.join(extensionRoot, 'server-plugin', 'story-orchestrator-judge')), ['index.mjs', 'lib/helper.mjs', 'package.json']);
});

test('installs both plugins without test files, then a second run changes nothing', () => {
    const { extensionRoot, stRoot } = fixture();
    const first = applyInstall(planInstall({ extensionRoot, stRoot, plugins: PLUGINS }));
    assert.deepEqual(first.map((row) => [row.name, row.action, row.copied.length]), [['story-orchestrator-judge', 'install', 3], ['story-orchestrator-harness', 'install', 3]]);
    for (const file of ['plugin.test.mjs', 'lib/helper.test.mjs', 'README.md', 'fixtures', 'node_modules', 'config.json']) {
        assert.equal(fs.existsSync(target(stRoot, 'story-orchestrator-judge', file)), false, file);
    }
    const second = applyInstall(planInstall({ extensionRoot, stRoot, plugins: PLUGINS }));
    assert.deepEqual(second.map((row) => [row.action, row.copied.length, row.differs.length]), [['unchanged', 0, 0], ['unchanged', 0, 0]]);
});

test('same version, different bytes: updates exactly the files that differ', () => {
    const { extensionRoot, stRoot } = fixture();
    applyInstall(planInstall({ extensionRoot, stRoot, plugins: PLUGINS }));
    fs.writeFileSync(target(stRoot, 'story-orchestrator-judge', 'lib/helper.mjs'), 'export const helper = 0;\n');
    fs.rmSync(target(stRoot, 'story-orchestrator-harness', 'index.mjs'));
    const plan = planInstall({ extensionRoot, stRoot, plugins: PLUGINS });
    assert.deepEqual(plan.map((row) => [row.action, row.differs]), [['update', ['lib/helper.mjs']], ['update', ['index.mjs']]]);
    assert.equal(JSON.parse(fs.readFileSync(target(stRoot, 'story-orchestrator-judge', 'package.json'), 'utf-8')).version, '1.4.0');
    const applied = applyInstall(plan);
    assert.deepEqual(applied.map((row) => row.copied), [['lib/helper.mjs'], ['index.mjs']]);
    assert.equal(fs.readFileSync(target(stRoot, 'story-orchestrator-judge', 'lib/helper.mjs'), 'utf-8'), 'export const helper = 1;\n');
    assert.ok(planInstall({ extensionRoot, stRoot, plugins: PLUGINS }).every((row) => row.action === 'unchanged'));
});

test('an installed copy with a higher version but other bytes is updated, not refused', () => {
    const { extensionRoot, stRoot } = fixture();
    write(target(stRoot, 'story-orchestrator-harness', 'package.json'), JSON.stringify({ name: 'story-orchestrator-harness', version: '9.0.0' }));
    write(target(stRoot, 'story-orchestrator-harness', 'index.mjs'), 'newer');
    const applied = applyInstall(planInstall({ extensionRoot, stRoot, plugins: ['story-orchestrator-harness'] }));
    assert.deepEqual(applied.map((row) => [row.action, row.copied]), [['update', ['index.mjs', 'lib/helper.mjs', 'package.json']]]);
    assert.match(fs.readFileSync(target(stRoot, 'story-orchestrator-harness', 'index.mjs'), 'utf-8'), /1\.1\.0/);
});

test('a local config.json is preserved and never compared', () => {
    const { extensionRoot, stRoot } = fixture();
    write(target(stRoot, 'story-orchestrator-judge', 'config.json'), '{"local":true}\n');
    write(target(stRoot, 'story-orchestrator-judge', 'index.mjs'), 'stale');
    const plan = planInstall({ extensionRoot, stRoot, plugins: ['story-orchestrator-judge'] });
    assert.equal(plan[0].differs.includes('config.json'), false);
    applyInstall(plan);
    assert.equal(fs.readFileSync(target(stRoot, 'story-orchestrator-judge', 'config.json'), 'utf-8'), '{"local":true}\n');
    assert.equal(planInstall({ extensionRoot, stRoot, plugins: ['story-orchestrator-judge'] })[0].action, 'unchanged');
});

test('judge by default; an optional plugin joins when asked or already installed', () => {
    const { stRoot } = fixture();
    assert.deepEqual(selectedPlugins([], { stRoot }), ['story-orchestrator-judge']);
    assert.deepEqual(selectedPlugins(['media'], { stRoot }), ['story-orchestrator-judge', 'story-orchestrator-media']);
    fs.mkdirSync(path.join(stRoot, 'plugins', 'story-orchestrator-gpu'));
    assert.deepEqual(selectedPlugins([], { stRoot }), ['story-orchestrator-judge', 'story-orchestrator-gpu']);
    assert.throws(() => selectedPlugins(['nope']), /Unknown plugin/);
});

test('the repo\'s real plugin list matches what ships in server-plugin/', () => {
    const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'server-plugin');
    assert.deepEqual(Object.keys(SERVER_PLUGINS).sort(), fs.readdirSync(repo).filter((name) => fs.statSync(path.join(repo, name)).isDirectory()).sort());
    for (const name of Object.keys(SERVER_PLUGINS)) {
        const files = shippedFiles(path.join(repo, name));
        assert.ok(files.includes('package.json') && files.includes('index.mjs'), name);
        assert.ok(files.every((file) => !file.endsWith('.test.mjs') && !file.startsWith('fixtures/') && file !== 'README.md'), name);
    }
});

test('release plugin versions include media and match every registered package', () => {
    const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
    const versions = pluginVersions(root);
    assert.ok(versions['story-orchestrator-media']);
    for (const name of Object.keys(SERVER_PLUGINS)) {
        assert.equal(versions[name], JSON.parse(fs.readFileSync(path.join(root, 'server-plugin', name, 'package.json'), 'utf8')).version);
    }
});
