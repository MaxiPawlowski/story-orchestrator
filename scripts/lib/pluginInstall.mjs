import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export const SERVER_PLUGINS = Object.freeze({
    'story-orchestrator-judge': Object.freeze({ optional: false }),
    'story-orchestrator-lore': Object.freeze({ optional: false }),
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
    const names = [...Object.keys(SERVER_PLUGINS).filter((name) => !SERVER_PLUGINS[name].optional), ...withPlugins.map((name) => `story-orchestrator-${name}`)];
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

export function dependencyPlan(source, target, fsImpl = fs) {
    let manifest;
    try {
        manifest = JSON.parse(fsImpl.readFileSync(path.join(source, 'package.json'), 'utf-8'));
    } catch {
        return [];
    }
    return Object.entries(manifest.dependencies ?? {}).map(([name, version]) => {
        let installed = null;
        try {
            installed = JSON.parse(fsImpl.readFileSync(path.join(target, 'node_modules', ...name.split('/'), 'package.json'), 'utf-8')).version ?? null;
        } catch {
            installed = null;
        }
        return { name, version, installed, current: installed === version };
    });
}

export function npmInstall(cwd, spawn = spawnSync) {
    const windows = process.platform === 'win32';
    const result = spawn(windows ? 'npm.cmd' : 'npm', ['install', '--omit=dev', '--no-audit', '--no-fund', '--no-package-lock', '--ignore-scripts'], { cwd, stdio: 'inherit', shell: windows });
    if (result.status !== 0) throw new Error(`npm install failed in ${cwd} (exit ${result.status ?? result.error?.code ?? '?'})`);
}

export function planInstall({ extensionRoot, stRoot, plugins = Object.keys(SERVER_PLUGINS), fsImpl = fs }) {
    return plugins.map((name) => {
        const source = path.join(extensionRoot, 'server-plugin', name);
        const target = path.join(stRoot, 'plugins', name);
        const files = shippedFiles(source, fsImpl);
        if (!files.length) throw new Error(`No shipped files in ${source}.`);
        const installed = fsImpl.existsSync(target);
        const differs = files.filter((file) => !fsImpl.existsSync(path.join(target, file))
            || hashFile(path.join(target, file), fsImpl) !== hashFile(path.join(source, file), fsImpl));
        const dependencies = dependencyPlan(source, target, fsImpl);
        const needsDependencies = dependencies.some((dependency) => !dependency.current);
        const action = !installed ? 'install' : differs.length ? 'update' : needsDependencies ? 'dependencies' : 'unchanged';
        return { name, source, target, files, differs, dependencies, needsDependencies, upToDate: !differs.length && !needsDependencies, action };
    });
}

export function applyInstall(rows, { fsImpl = fs, install = npmInstall } = {}) {
    return rows.map((row) => {
        if (row.action === 'unchanged') return { ...row, copied: [], installedDependencies: [] };
        for (const file of row.differs) {
            if (LOCAL_FILES.includes(file)) throw new Error(`Refusing to overwrite local ${file} in ${row.target}.`);
            fsImpl.mkdirSync(path.dirname(path.join(row.target, file)), { recursive: true });
            fsImpl.copyFileSync(path.join(row.source, file), path.join(row.target, file));
        }
        const missing = row.dependencies.filter((dependency) => !dependency.current);
        if (missing.length && install) install(row.target);
        return { ...row, copied: [...row.differs], installedDependencies: missing.map((dependency) => `${dependency.name}@${dependency.version}`) };
    });
}
