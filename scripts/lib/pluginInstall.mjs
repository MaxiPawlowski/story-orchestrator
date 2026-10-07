import fs from 'node:fs';
import path from 'node:path';

export const SERVER_PLUGINS = Object.freeze({
    'story-orchestrator-judge': ['package.json', 'index.mjs'],
    'story-orchestrator-gpu': ['package.json', 'index.mjs', 'gate.mjs', 'managed.mjs'],
    'story-orchestrator-harness': ['package.json', 'index.mjs', 'agentBridge.mjs', 'mcpShim.mjs'],
    'story-orchestrator-media': ['package.json', 'index.mjs', 'jobs.mjs', 'files.mjs', 'comfyTarget.mjs'],
});

export function selectedPlugins(withPlugins = []) {
    const names = ['story-orchestrator-judge', ...withPlugins.map((name) => `story-orchestrator-${name}`)];
    for (const name of names) if (!SERVER_PLUGINS[name]) throw new Error(`Unknown plugin ${name}. Choose gpu, harness or media.`);
    return Object.fromEntries([...new Set(names)].map((name) => [name, SERVER_PLUGINS[name]]));
}

const readVersion = (dir, fsImpl) => {
    try {
        const version = JSON.parse(fsImpl.readFileSync(path.join(dir, 'package.json'), 'utf-8')).version;
        return typeof version === 'string' ? version : null;
    } catch {
        return null;
    }
};

export function pluginVersions(extensionRoot, fsImpl = fs) {
    return Object.fromEntries(Object.keys(SERVER_PLUGINS).map((name) => [name, readVersion(path.join(extensionRoot, 'server-plugin', name), fsImpl)]));
}

export function compareVersions(left, right) {
    const parts = (value) => String(value).split('.').map((part) => Number.parseInt(part, 10) || 0);
    const [a, b] = [parts(left), parts(right)];
    for (let index = 0; index < Math.max(a.length, b.length); index += 1) {
        const diff = (a[index] ?? 0) - (b[index] ?? 0);
        if (diff) return Math.sign(diff);
    }
    return 0;
}

export function planInstall({ extensionRoot, stRoot, plugins = SERVER_PLUGINS, fsImpl = fs }) {
    return Object.entries(plugins).map(([name, files]) => {
        const source = path.join(extensionRoot, 'server-plugin', name);
        const target = path.join(stRoot, 'plugins', name);
        const sourceVersion = readVersion(source, fsImpl);
        const installedVersion = fsImpl.existsSync(target) ? readVersion(target, fsImpl) : null;
        const upToDate = files.every((file) => fsImpl.existsSync(path.join(target, file))
            && fsImpl.readFileSync(path.join(target, file), 'utf-8') === fsImpl.readFileSync(path.join(source, file), 'utf-8'));
        let action = 'install';
        if (upToDate) action = 'unchanged';
        else if (installedVersion && sourceVersion && compareVersions(installedVersion, sourceVersion) > 0) action = 'refuse-downgrade';
        else if (installedVersion) action = 'upgrade';
        return { name, source, target, files, sourceVersion, installedVersion, upToDate, action };
    });
}

export function applyInstall(rows, { force = false, fsImpl = fs } = {}) {
    return rows.map((row) => {
        if (row.action === 'unchanged') return { ...row, copied: [] };
        if (row.action === 'refuse-downgrade' && !force) return { ...row, copied: [] };
        fsImpl.mkdirSync(row.target, { recursive: true });
        for (const file of row.files) fsImpl.copyFileSync(path.join(row.source, file), path.join(row.target, file));
        return { ...row, copied: [...row.files] };
    });
}
