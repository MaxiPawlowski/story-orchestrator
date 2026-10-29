import { execFile } from 'node:child_process';
import fsDefault from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

export const SPILL_DIR_NAME = 'member-spill';
const SERVER_DIR = /^\d+$/;
const SPILL_FILE = /^[0-9a-f]{16}\.(spill|tmp)$/;

export const spillDirFor = (stateDir) => path.join(stateDir ?? '.', SPILL_DIR_NAME);

export function runIcacls(args, { execFileImpl = execFile } = {}) {
    return new Promise((resolve) => {
        execFileImpl('icacls', args, { windowsHide: true, timeout: 15000 }, (error, stdout = '', stderr = '') => {
            resolve({ ok: !error, code: error ? error.code ?? 1 : 0, output: `${stdout}${stderr}`.trim() });
        });
    });
}

export function parseAces(output, dir) {
    const aces = [];
    for (const [index, raw] of String(output).split(/\r?\n/).entries()) {
        let line = raw;
        if (index === 0) {
            if (!line.toLowerCase().startsWith(dir.toLowerCase())) return null;
            line = line.slice(dir.length);
        }
        line = line.trim();
        if (!line) break;
        const at = line.indexOf(':(');
        if (at <= 0) continue;
        aces.push({ principal: line.slice(0, at), rights: line.slice(at + 1) });
    }
    return aces;
}

const samePrincipal = (principal, user) => {
    const a = principal.toLowerCase();
    const b = user.toLowerCase();
    return a === b || a.endsWith(`\\${b}`);
};

export async function ensureSpillDir(dir, { fs = fsDefault, platform = process.platform, icacls = runIcacls, user = os.userInfo().username } = {}) {
    try { await fs.mkdir(dir, { recursive: true }); }
    catch (error) { return { ok: false, reason: `could not create ${dir}: ${error.message}` }; }
    if (platform !== 'win32') {
        try { await fs.chmod(dir, 0o700); return { ok: true, acl: 'mode 0700' }; }
        catch (error) { return { ok: false, reason: `chmod failed: ${error.message}` }; }
    }
    const set = await icacls([dir, '/inheritance:r', '/grant:r', `${user}:(OI)(CI)F`]);
    if (!set.ok) return { ok: false, reason: `icacls answered ${set.code}: ${set.output.split(/\r?\n/)[0] ?? ''}` };
    const shown = await icacls([dir]);
    const aces = shown.ok ? parseAces(shown.output, dir) : null;
    if (!aces?.length) return { ok: false, reason: 'could not read the spill directory ACL back' };
    const foreign = aces.filter((ace) => !samePrincipal(ace.principal, user));
    if (foreign.length) return { ok: false, reason: `spill directory ACL still grants ${foreign.map((ace) => ace.principal).join(', ')}` };
    return { ok: true, acl: `owner only (${user})` };
}

async function serverDirs(dir, fs) {
    let names;
    try { names = await fs.readdir(dir); } catch (error) { if (error.code === 'ENOENT') return []; throw error; }
    return names.filter((name) => SERVER_DIR.test(name));
}

export async function sweepSpill(dir, keepPid = null, { fs = fsDefault } = {}) {
    const keep = keepPid === null || keepPid === undefined ? null : String(keepPid);
    let removed = 0;
    for (const name of await serverDirs(dir, fs)) {
        if (name === keep) continue;
        await fs.rm(path.join(dir, name), { recursive: true, force: true });
        removed += 1;
    }
    return removed;
}

export async function spillUsage(dir, { fs = fsDefault } = {}) {
    const usage = { dirs: 0, files: 0, bytes: 0 };
    for (const name of await serverDirs(dir, fs)) {
        usage.dirs += 1;
        let files = [];
        try { files = await fs.readdir(path.join(dir, name)); } catch { continue; }
        for (const file of files) {
            if (!SPILL_FILE.test(file)) continue;
            usage.files += 1;
            try { usage.bytes += (await fs.stat(path.join(dir, name, file))).size; } catch {}
        }
    }
    return usage;
}
