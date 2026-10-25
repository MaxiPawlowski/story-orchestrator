import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { BACKUP_ROOT, preserve } from './backup.mjs';

export const STABLE_SUFFIX = ' (stable head)';
export const JOIN_EXCLUDE_MUTED = 1;

export function stableSysprompt(sysprompt) {
    const content = String(sysprompt?.content ?? '');
    const lines = content.split(/(?<=\.)\s+/);
    const memberLines = lines.filter((line) => line.includes('{{char}}'));
    if (!memberLines.length) return null;
    const shared = lines.filter((line) => !line.includes('{{char}}')).join(' ').trim();
    const post = [String(sysprompt?.post_history ?? '').trim(), memberLines.join(' ').trim()].filter(Boolean).join('\n');
    return { ...sysprompt, name: `${sysprompt.name}${STABLE_SUFFIX}`, content: shared, post_history: post };
}

export function planStableHead(settings, groups) {
    const current = settings?.power_user?.sysprompt;
    const sysprompt = current?.enabled === false ? null : stableSysprompt(current);
    const joined = groups.filter((group) => group.generation_mode !== JOIN_EXCLUDE_MUTED).map((group) => ({ id: group.id, name: group.name, from: group.generation_mode ?? 0 }));
    return { sysprompt, joined };
}

const readJson = async (file) => JSON.parse(await fs.readFile(file, 'utf8'));
const writeJson = (file, value) => fs.writeFile(file, `${JSON.stringify(value, null, 4)}\n`);

async function main() {
    const [command = 'plan'] = process.argv.slice(2);
    const option = (name) => { const at = process.argv.indexOf(`--${name}`); return at >= 0 ? process.argv[at + 1] : null; };
    const data = option('data');
    if (!data) throw new Error('Usage: node scripts/local/stable-head.mjs plan|apply|revert --data <ST user data dir> --group <id>[,<id>] [--backup <dir>]');
    const ids = (option('group') ?? '').split(',').filter(Boolean);
    const settingsFile = path.join(data, 'settings.json');
    const groupFiles = ids.map((id) => path.join(data, 'groups', `${id}.json`));
    if (command === 'revert') {
        const from = option('backup');
        if (!from) throw new Error('revert needs --backup <dir> written by apply.');
        const manifest = await readJson(path.join(from, 'manifest.json'));
        for (const [name, target] of manifest.files) await fs.copyFile(path.join(from, name), target);
        if (manifest.created) await fs.rm(manifest.created, { force: true });
        console.log(JSON.stringify({ reverted: manifest.files.map(([, target]) => target), removed: manifest.created ?? null }));
        return;
    }
    const settings = await readJson(settingsFile);
    const groups = await Promise.all(groupFiles.map(readJson));
    const plan = planStableHead(settings, groups);
    console.log(JSON.stringify({ data, ...plan }, null, 2));
    if (command !== 'apply') return;
    const target = option('backup') ?? `${BACKUP_ROOT}/stable-head-${Date.now()}`;
    const files = [[settingsFile, 'settings.json'], ...groupFiles.map((file) => [file, `groups/${path.basename(file)}`])];
    await preserve(files, target);
    let created = null;
    if (plan.sysprompt) {
        created = path.join(data, 'sysprompt', `${plan.sysprompt.name}.json`);
        await writeJson(created, { name: plan.sysprompt.name, content: plan.sysprompt.content, post_history: plan.sysprompt.post_history });
        settings.power_user.sysprompt = plan.sysprompt;
        await writeJson(settingsFile, settings);
    }
    for (const [at, group] of groups.entries()) if (group.generation_mode !== JOIN_EXCLUDE_MUTED) await writeJson(groupFiles[at], { ...group, generation_mode: JOIN_EXCLUDE_MUTED });
    await writeJson(path.join(target, 'manifest.json'), { at: new Date().toISOString(), files: files.map(([source, name]) => [name, source]), created });
    console.log(JSON.stringify({ applied: true, backup: target, created }));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
