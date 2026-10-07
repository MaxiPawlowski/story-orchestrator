import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export const SERVER_PLUGINS = Object.freeze({
    'story-orchestrator-judge': Object.freeze({ optional: false }),
    'story-orchestrator-gpu': Object.freeze({ optional: true }),
    'story-orchestrator-harness': Object.freeze({ optional: true }),
    'story-orchestrator-media': Object.freeze({ optional: true }),
});

export const LOCAL_FILES = Object.freeze(['config.json']);
const SKIPPED_DIRS = new Set(['fixtures', 'node_modules']);
const isShipped = (rel, name) => !name.endsWith('.test.mjs') && name !== 'README.md' && !LOCAL_FILES.includes(rel);

export function shippedFiles(dir, fsImpl = fs, prefix = '') {
    if (!fsImpl.existsSync(dir)) return [];
    return fsImpl.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
        const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
        if (entry.isDirectory()) return SKIPPED_DIRS.has(entry.name) ? [] : shippedFiles(path.join(dir, entry.name), fsImpl, rel);
        return entry.isFile() && isShipped(rel, entry.name) ? [rel] : [];
    }).sort();
}

export function selectedPlugins(withPlugins = [], { stRoot = null, fsImpl = fs } = {}) {
    const names = ['story-orchestrator-judge', ...withPlugins.map((name) => `story-orchestrator-${name}`)];
    for (const name of names) if (!SERVER_PLUGINS[name]) throw new Error(`Unknown plugin ${name}. Choose gpu, harness or media.`);
    const installed = stRoot ? Object.keys(SERVER_PLUGINS).filter((name) => fsImpl.existsSync(path.join(stRoot, 'plugins', name))) : [];
    return Object.keys(SERVER_PLUGINS).filter((name) => names.includes(name) || installed.includes(name));
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

const hashFile = (file, fsImpl) => crypto.createHash('sha256').update(fsImpl.readFileSync(file)).digest('hex');

export function planInstall({ extensionRoot, stRoot, plugins = Object.keys(SERVER_PLUGINS), fsImpl = fs }) {
    return plugins.map((name) => {
        const source = path.join(extensionRoot, 'server-plugin', name);
        const target = path.join(stRoot, 'plugins', name);
        const files = shippedFiles(source, fsImpl);
        if (!files.length) throw new Error(`No shipped files in ${source}.`);
        const installed = fsImpl.existsSync(target);
        const differs = files.filter((file) => !fsImpl.existsSync(path.join(target, file))
            || hashFile(path.join(target, file), fsImpl) !== hashFile(path.join(source, file), fsImpl));
        const action = !installed ? 'install' : differs.length ? 'update' : 'unchanged';
        return { name, source, target, files, differs, upToDate: !differs.length, action };
    });
}

export function applyInstall(rows, { fsImpl = fs } = {}) {
    return rows.map((row) => {
        if (row.action === 'unchanged') return { ...row, copied: [] };
        for (const file of row.differs) {
            if (LOCAL_FILES.includes(file)) throw new Error(`Refusing to overwrite local ${file} in ${row.target}.`);
            fsImpl.mkdirSync(path.dirname(path.join(row.target, file)), { recursive: true });
            fsImpl.copyFileSync(path.join(row.source, file), path.join(row.target, file));
        }
        return { ...row, copied: [...row.differs] };
    });
}
