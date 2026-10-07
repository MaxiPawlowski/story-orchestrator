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

async function readManifest(folder, character, set) {
    try {
        const manifest = JSON.parse(await fs.readFile(path.join(folder, 'so-sprites.json'), 'utf8'));
        if (manifest.owner !== 'story-orchestrator' || manifest.character !== character || manifest.set !== set) throw new Error('Sprite manifest ownership does not match.');
        return manifest;
    } catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}

export async function readSet(root, character, set) {
    const folder = await setFolder(root, character, set).catch(() => null);
    return folder ? readManifest(folder, character, set) : null;
}

export async function alphaRecipes(roots, recipes, nodes) {
    const result = [];
    if (!nodes.SplitImageWithAlpha) return result;
    for (const recipe of Array.isArray(recipes) ? recipes : []) {
        if (!recipe || !id(recipe.id) || !['RMBG', 'BiRefNetRMBG'].includes(recipe.node) || typeof recipe.model !== 'string'
            || !Array.isArray(recipe.files) || !recipe.files.length) continue;
        const choices = nodes[recipe.node]?.input?.required?.model?.[0];
        if (!Array.isArray(choices) || !choices.includes(recipe.model)) continue;
        try {
            const files = await Promise.all(recipe.files.map((file) => fingerprint(roots[file.kind] ?? [], file.name)));
            result.push({ id: recipe.id, node: recipe.node, model: recipe.model, files });
        } catch { continue; }
    }
    return result;
}

async function storeManifest(folder, manifest) {
    await atomic(path.join(folder, 'so-sprites.json'), JSON.stringify(manifest));
    if (Object.keys(manifest.labels).length || !(await fs.readdir(folder)).every((name) => name === 'so-sprites.json')) return false;
    await fs.unlink(path.join(folder, 'so-sprites.json'));
    await fs.rmdir(folder).catch((error) => { if (error.code !== 'ENOTEMPTY' && error.code !== 'EEXIST') throw error; });
    return true;
}

async function referenceFolder(root, character, set) {
    if (!plainName(character) || typeof set !== 'string' || (set !== '' && !id(set))) throw new Error('Invalid reference pack.');
    const base = await fs.realpath(root);
    const folder = await fs.realpath(path.join(base, character, set));
    if (!folder.startsWith(`${base}${path.sep}`)) throw new Error('Reference pack leaves this user’s directory.');
    return folder;
}

export async function referenceSets(root, character) {
    const folder = await referenceFolder(root, character, '');
    const entries = await fs.readdir(folder, { withFileTypes: true });
    return ['', ...entries.filter((entry) => entry.isDirectory() && id(entry.name)).map((entry) => entry.name).sort()];
}

export async function referencePack(root, character, set) {
    const folder = await referenceFolder(root, character, set);
    const names = (await fs.readdir(folder, { withFileTypes: true }))
        .filter((entry) => entry.isFile() && /^[a-z0-9_]+(?:[-.][a-z0-9_.-]+)?\.png$/i.test(entry.name))
        .map((entry) => entry.name).sort();
    const labels = new Set();
    const files = [];
    for (const name of names) {
        const label = name.split(/[-.]/)[0].toLowerCase();
        if (!id(label) || labels.has(label)) continue;
        const bytes = await fs.readFile(path.join(folder, name));
        pngBytes(bytes.toString('base64'));
        files.push({ label, path: `/characters/${encodeURIComponent(character)}/${set ? `${set}/` : ''}${encodeURIComponent(name)}`,
            sha256: digest(bytes), width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) });
        labels.add(label);
    }
    return { character, set, sha256: digest(JSON.stringify(files)), files };
}

// A crash between `saveSprite`'s pending write and its completed one leaves a row quoting a file that
// did or did not land. Reconcile against the bytes: a matching file completes the row, anything else is
// dropped and its partial file removed. Under the set lock, so it cannot rewrite over a live save.
export async function reconcileSet(root, character, set) {
    return serial(`${root}:${character}:${set}`, async () => {
        const folder = await setFolder(root, character, set).catch(() => null);
        if (!folder) return null;
        const manifest = await readManifest(folder, character, set);
        if (!manifest) return null;
        let changed = false;
        for (const [label, row] of Object.entries(manifest.labels ?? {})) {
            if (row.status !== 'pending') continue;
            const file = path.join(folder, `${label}.png`);
            const bytes = await fs.readFile(file).catch((error) => { if (error.code === 'ENOENT') return null; throw error; });
            if (bytes && digest(bytes) === row.sha256) row.status = 'complete';
            else {
                if (bytes) await fs.unlink(file).catch(() => {});
                delete manifest.labels[label];
            }
            changed = true;
        }
        if (changed) await atomic(path.join(folder, 'so-sprites.json'), JSON.stringify(manifest));
        return manifest;
    });
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
        await storeManifest(folder, manifest);
        return { deleted: true };
    });
}

// Story-scoped removal: an on-demand label records the story it was built for in `inputs.story`.
// Remove exactly those labels across every set of every character; a set left empty goes too. A label
// with no story (a base pack the author built in Studio) is never in scope.
export async function removeStorySprites(root, story) {
    if (typeof story !== 'string' || !story || story.length > 200) throw new Error('Invalid story id.');
    const base = await fs.realpath(root);
    const characters = await fs.readdir(base, { withFileTypes: true });
    const removed = { sets: [], labels: [] };
    for (const character of characters) {
        if (!character.isDirectory() || !plainName(character.name)) continue;
        for (const manifest of await listSets(root, character.name)) {
            await serial(`${root}:${character.name}:${manifest.set}`, async () => {
                const folder = await setFolder(root, character.name, manifest.set);
                const current = await readManifest(folder, character.name, manifest.set);
                if (!current) return;
                let changed = false;
                for (const [label, row] of Object.entries(current.labels ?? {})) {
                    if (!labelId(label) || row?.inputs?.story !== story) continue;
                    const file = path.join(folder, `${label}.png`);
                    const bytes = await fs.readFile(file).catch((error) => { if (error.code === 'ENOENT') return null; throw error; });
                    if (bytes && digest(bytes) !== row.sha256) continue;
                    if (bytes) await fs.unlink(file);
                    delete current.labels[label];
                    removed.labels.push(`${character.name}/${current.set}/${label}`);
                    changed = true;
                }
                if (!changed) return;
                if (await storeManifest(folder, current)) {
                    removed.sets.push(`${character.name}/${current.set}`);
                }
            });
        }
    }
    return removed;
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
        const manifest = await reconcileSet(root, character, entry.name);
        if (manifest) result.push(manifest);
    }
    return result;
}

export async function spriteInventory(root) {
    const rows = [];
    for (const character of await fs.readdir(root, { withFileTypes: true })) {
        if (!character.isDirectory() || !plainName(character.name)) continue;
        for (const manifest of await listSets(root, character.name)) {
            const folder = await setFolder(root, character.name, manifest.set);
            for (const [label, row] of Object.entries(manifest.labels ?? {})) {
                if (!labelId(label)) throw new Error('A generated sprite manifest has an invalid label.');
                const bytes = await fs.readFile(path.join(folder, `${label}.png`)).catch((error) => { if (error.code === 'ENOENT') return null; throw error; });
                rows.push({ character: character.name, set: manifest.set, label, sha256: row.sha256,
                    actualHash: bytes ? digest(bytes) : null, story: typeof row.inputs?.story === 'string' ? row.inputs.story : null });
            }
        }
    }
    return { trusted: true, rows, references: await referenceInventory(root) };
}

const referenceName = (name) => typeof name === 'string' && /^story-orchestrator\/so_[a-f0-9-]{36}\.png$/.test(name);
const referenceLedger = (root) => path.join(root, '.so-media-references.json');
const readReferences = async (root) => JSON.parse(await fs.readFile(referenceLedger(root), 'utf8').catch((error) => {
    if (error.code === 'ENOENT') return '{}';
    throw error;
}));

export async function recordReference(root, name, sha256, scope = {}) {
    if (!referenceName(name) || !/^[a-f0-9]{64}$/.test(sha256)) throw new Error('Invalid reference ownership.');
    return serial(`${root}:references`, async () => {
        const rows = await readReferences(root);
        if (rows[name]) throw new Error('A reference with this name is already recorded.');
        rows[name] = { sha256, createdAt: Date.now(), unused: false,
            character: typeof scope.character === 'string' ? scope.character : null,
            set: typeof scope.set === 'string' ? scope.set : null, story: typeof scope.story === 'string' ? scope.story : null };
        await atomic(referenceLedger(root), JSON.stringify(rows));
    });
}

export async function referenceInventory(root) {
    return Object.entries(await readReferences(root)).map(([name, row]) => ({ name, ...row }));
}

export async function ownsReference(root, name) {
    if (!referenceName(name)) return false;
    const row = (await readReferences(root))[name];
    return Boolean(row && !row.unused);
}

export async function releaseReference(root, name) {
    if (!referenceName(name)) throw new Error('Invalid reference name.');
    return serial(`${root}:references`, async () => {
        const rows = await readReferences(root);
        if (!rows[name]) throw new Error('This reference does not belong to this user.');
        rows[name].unused = true;
        await atomic(referenceLedger(root), JSON.stringify(rows));
        return { released: true };
    });
}

export async function pruneReferences(root, inputRoot, names) {
    if (!Array.isArray(names) || names.some((name) => !referenceName(name))) throw new Error('Pruning needs an explicit list of owned references.');
    if (!inputRoot) return { deleted: [], errors: [], deferred: 'Configure comfyInputRoot on the local ComfyUI host.' };
    return serial(`${root}:references`, async () => {
        const rows = await readReferences(root);
        const base = await fs.realpath(inputRoot);
        const folder = await fs.realpath(path.join(base, 'story-orchestrator')).catch((error) => { if (error.code === 'ENOENT') return null; throw error; });
        if (folder && !folder.startsWith(`${base}${path.sep}`)) throw new Error('Reference folder leaves the configured ComfyUI input root.');
        const report = { deleted: [], errors: [] };
        for (const name of names) {
            const row = rows[name];
            if (!row?.unused) { report.errors.push(`${name}: reference is active or not owned`); continue; }
            const file = folder ? path.join(folder, path.basename(name)) : null;
            const stat = file ? await fs.lstat(file).catch((error) => { if (error.code === 'ENOENT') return null; throw error; }) : null;
            if (stat?.isSymbolicLink()) { report.errors.push(`${name}: reference is a symbolic link`); continue; }
            const bytes = stat ? await fs.readFile(file) : null;
            if (bytes && digest(bytes) !== row.sha256) { report.errors.push(`${name}: reference changed outside this plugin`); continue; }
            if (bytes) await fs.unlink(file);
            delete rows[name];
            report.deleted.push(name);
        }
        await atomic(referenceLedger(root), JSON.stringify(rows));
        return report;
    });
}
