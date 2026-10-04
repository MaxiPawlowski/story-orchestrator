import fs from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';

export const digest = (data) => createHash('sha256').update(data).digest('hex');
const hashes = new Map();
const locks = new Map();
const id = (value) => typeof value === 'string' && /^[a-z0-9_]{1,80}$/.test(value);
const setId = (value) => id(value) || typeof value === 'string' && /^anim-[a-z0-9_]{1,80}$/.test(value);
const labelId = (value) => id(value) || typeof value === 'string' && /^[a-z0-9_]{1,80}\.(blink|talk|talk2)$/.test(value);
const plainName = (value) => typeof value === 'string' && value.length <= 160 && !/[\\/:\x00-\x1f]/.test(value) && value !== '.' && value !== '..' && value.trim() === value && value.length > 0;

export async function fingerprint(roots, name) {
    if (typeof name !== 'string' || !name || path.isAbsolute(name) || name.split(/[\\/]/).some((part) => part === '..' || part === '.')) throw new Error('Invalid model name.');
    for (const root of roots) {
        const base = await fs.realpath(root).catch(() => null);
        if (!base) continue;
        const file = await fs.realpath(path.resolve(base, name)).catch(() => null);
        if (!file || !file.startsWith(`${base}${path.sep}`)) continue;
        const stat = await fs.stat(file);
        if (!stat.isFile()) continue;
        const key = `${file}:${stat.size}:${stat.mtimeMs}:${stat.ctimeMs}`;
        if (hashes.has(key)) return hashes.get(key);
        const hash = createHash('sha256');
        for await (const bytes of createReadStream(file)) hash.update(bytes);
        const after = await fs.stat(file);
        if (after.size !== stat.size || after.mtimeMs !== stat.mtimeMs || after.ctimeMs !== stat.ctimeMs) throw new Error('Model changed while its fingerprint was read.');
        const result = { name, sha256: hash.digest('hex'), size: stat.size };
        if (hashes.size >= 128) hashes.clear();
        hashes.set(key, result);
        return result;
    }
    throw new Error(`Model ${name} is not under a configured model root. Configure the media plugin on the ComfyUI host.`);
}

export function pngBytes(data) {
    if (typeof data !== 'string' || data.length > 44_000_000 || !/^[A-Za-z0-9+/]*={0,2}$/.test(data)) throw new Error('Invalid PNG data.');
    const bytes = Buffer.from(data, 'base64');
    if (bytes.length < 24 || !bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) throw new Error('Expected a PNG image.');
    const width = bytes.readUInt32BE(16), height = bytes.readUInt32BE(20);
    if (!width || !height || width > 8192 || height > 8192 || width * height > 16_777_216) throw new Error('PNG dimensions exceed the sprite limit.');
    return bytes;
}

async function atomic(file, bytes) {
    const temporary = `${file}.${randomUUID()}.tmp`;
    try { await fs.writeFile(temporary, bytes, { flag: 'wx' }); await fs.rename(temporary, file); }
    finally { await fs.unlink(temporary).catch(() => {}); }
}

async function serial(key, run) {
    const previous = locks.get(key) ?? Promise.resolve();
    const current = previous.catch(() => {}).then(run);
    locks.set(key, current);
    try { return await current; } finally { if (locks.get(key) === current) locks.delete(key); }
}

async function setFolder(root, character, set, create = false) {
    if (!plainName(character) || !setId(set)) throw new Error('Invalid character or sprite set.');
    const base = await fs.realpath(root);
    const characterFolder = path.join(base, character);
    if (create) await fs.mkdir(characterFolder, { recursive: false }).catch((error) => { if (error.code !== 'EEXIST') throw error; });
    const characterReal = await fs.realpath(characterFolder);
    if (!characterReal.startsWith(`${base}${path.sep}`)) throw new Error('Character folder leaves this user’s directory.');
    const folder = path.join(characterReal, set);
    if (create) await fs.mkdir(folder, { recursive: false }).catch((error) => { if (error.code !== 'EEXIST') throw error; });
    const real = await fs.realpath(folder);
    if (!real.startsWith(`${base}${path.sep}`)) throw new Error('Sprite folder leaves this user’s character directory.');
    return real;
}

export async function readSet(root, character, set) {
    const folder = await setFolder(root, character, set).catch(() => null);
    if (!folder) return null;
    try {
        const manifest = JSON.parse(await fs.readFile(path.join(folder, 'so-sprites.json'), 'utf8'));
        if (manifest.owner !== 'story-orchestrator' || manifest.character !== character || manifest.set !== set) throw new Error('Sprite manifest ownership does not match.');
        return manifest;
    } catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}

export async function saveSprite(root, request) {
    const { character, set, label, data, key, recipe, qa, inputs, expectedHash } = request;
    if (!labelId(label) || !/^[a-f0-9]{64}$/.test(key) || !recipe || typeof recipe.id !== 'string' || !Number.isInteger(recipe.version)) throw new Error('Sprite provenance is incomplete.');
    const bytes = pngBytes(data), sha256 = digest(bytes);
    return serial(`${root}:${character}:${set}`, async () => {
        const folder = await setFolder(root, character, set, true);
        const file = path.join(folder, `${label}.png`);
        const previous = await readSet(root, character, set);
        const existing = await fs.readFile(file).catch((error) => { if (error.code === 'ENOENT') return null; throw error; });
        const row = previous?.labels?.[label];
        if (existing && (!row || digest(existing) !== row.sha256)) throw new Error('This sprite is not an unchanged file created by Story Orchestrator.');
        if (existing && row.key === key && row.sha256 === sha256) return { path: `/characters/${encodeURIComponent(character)}/${set}/${label}.png`, sha256, manifest: previous };
        if (existing && expectedHash !== row.sha256) throw new Error('Confirm replacing this generated sprite after reviewing it.');
        const manifest = previous ?? { owner: 'story-orchestrator', version: 1, character, set, labels: {} };
        manifest.labels[label] = { key, sha256, recipe, qa, inputs, createdAt: new Date().toISOString(), status: 'pending' };
        await atomic(path.join(folder, 'so-sprites.json'), JSON.stringify(manifest));
        await atomic(file, bytes);
        manifest.labels[label].status = 'complete';
        await atomic(path.join(folder, 'so-sprites.json'), JSON.stringify(manifest));
        return { path: `/characters/${encodeURIComponent(character)}/${set}/${label}.png?t=${sha256.slice(0, 12)}`, sha256, manifest };
    });
}

export async function deleteSprite(root, request) {
    const { character, set, label, expectedHash } = request;
    if (!labelId(label)) throw new Error('Invalid sprite label.');
    return serial(`${root}:${character}:${set}`, async () => {
        const folder = await setFolder(root, character, set);
        const manifest = await readSet(root, character, set);
        const row = manifest?.labels?.[label];
        if (!row || row.sha256 !== expectedHash) throw new Error('This sprite is not an owned file at the confirmed version.');
        const file = path.join(folder, `${label}.png`);
        const bytes = await fs.readFile(file);
        if (digest(bytes) !== row.sha256) throw new Error('The sprite changed outside Story Orchestrator.');
        await fs.unlink(file);
        delete manifest.labels[label];
        await atomic(path.join(folder, 'so-sprites.json'), JSON.stringify(manifest));
        return { deleted: true };
    });
}

export async function listSets(root, character) {
    if (!plainName(character)) throw new Error('Invalid character name.');
    const base = await fs.realpath(root);
    const folder = await fs.realpath(path.join(base, character)).catch(() => null);
    if (!folder || !folder.startsWith(`${base}${path.sep}`)) return [];
    const entries = await fs.readdir(folder, { withFileTypes: true });
    const result = [];
    for (const entry of entries) {
        if (!entry.isDirectory() || !setId(entry.name)) continue;
        const manifest = await readSet(root, character, entry.name);
        if (manifest) result.push(manifest);
    }
    return result;
}
