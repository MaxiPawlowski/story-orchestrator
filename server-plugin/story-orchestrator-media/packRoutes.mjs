import fs from 'node:fs/promises';
import path from 'node:path';

export const PACK_DIR = ['story-orchestrator', 'visual-packs'];
export const MAX_PACK_FILES = 512;
export const MAX_PACK_BYTES = 512 * 1024;
const MAX_DEPTH = 3;

export async function readInstalledPacks(root) {
    const base = path.join(root, ...PACK_DIR);
    const packs = [], errors = [];
    const walk = async (folder, depth) => {
        let entries;
        try { entries = await fs.readdir(folder, { withFileTypes: true }); }
        catch (error) { if (error.code === 'ENOENT') return; throw error; }
        entries.sort((a, b) => a.name.localeCompare(b.name));
        for (const entry of entries) {
            if (packs.length + errors.length >= MAX_PACK_FILES) return;
            const full = path.join(folder, entry.name);
            const file = path.relative(base, full).split(path.sep).join('/');
            if (entry.isDirectory() && depth < MAX_DEPTH) await walk(full, depth + 1);
            if (!entry.isFile() || !entry.name.toLowerCase().endsWith('.json')) continue;
            const stat = await fs.stat(full);
            if (stat.size > MAX_PACK_BYTES) { errors.push({ file, error: 'larger than 512 KB' }); continue; }
            try { packs.push({ file, pack: JSON.parse(await fs.readFile(full, 'utf8')) }); }
            catch { errors.push({ file, error: 'not valid JSON' }); }
        }
    };
    await walk(base, 0);
    return { packs, errors };
}

export function mountPackRoutes(router) {
    router.get('/packs', async (req, res) => {
        const root = req?.user?.directories?.root;
        if (!root) return res.status(401).json({ error: 'Open SillyTavern with a user session first.' });
        try { res.json(await readInstalledPacks(root)); }
        catch (error) { res.status(400).json({ error: error.message }); }
    });
}
