import fs from 'node:fs';
import path from 'node:path';

export const PLUGIN_VERSION = '1.0.0';

export const info = {
    id: 'story-orchestrator-lore',
    name: 'Story Orchestrator lorebook commit',
    description: 'Conditional whole-book save for Story Orchestrator: a lorebook file is replaced only while it still holds the entries the write started from.',
};

const sortedKeys = (_key, inner) => (inner && typeof inner === 'object' && !Array.isArray(inner)
    ? Object.fromEntries(Object.entries(inner).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)))
    : inner);

export const canonicalJson = (value) => JSON.stringify(value, sortedKeys) ?? '';

const fnv1a = (text) => {
    let hash = 2166136261;
    for (let index = 0; index < text.length; index += 1) {
        hash ^= text.charCodeAt(index);
        hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(16).padStart(8, '0');
};

export const lorebookRevision = (entries) => {
    const image = canonicalJson(entries ?? {});
    return `${image.length.toString(16)}-${fnv1a(image)}${fnv1a([...image].reverse().join(''))}`;
};

const RESERVED = /^(con|prn|aux|nul|com[0-9]|lpt[0-9])(\..*)?$/i;

export const fileNameIssue = (name) => {
    if (typeof name !== 'string' || !name.trim()) return 'a lorebook name is required';
    if (/[/\\?<>:*|"\u0000-\u001f\u0080-\u009f]/.test(name)) return 'the name holds a character a file name cannot';
    if (name === '.' || name === '..' || /[. ]$/.test(name) || RESERVED.test(name)) return 'the name is not a plain file name';
    return null;
};

const readBook = (file) => {
    try {
        return JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch (error) {
        if (error?.code === 'ENOENT') return null;
        throw error;
    }
};

const replaceFile = (file, text) => {
    const temp = `${file}.${process.pid}.${Date.now()}.so-lore.tmp`;
    try {
        fs.writeFileSync(temp, text, 'utf8');
        fs.renameSync(temp, file);
    } finally {
        if (fs.existsSync(temp)) fs.rmSync(temp, { force: true });
    }
};

// Read, compare and replace run with no await between them, so on Node's one thread no other request,
// ST's own /api/worldinfo/edit included, can land between the comparison and the write.
export function commitLorebook(worlds, body) {
    const { name, expected, data } = body ?? {};
    const issue = fileNameIssue(name);
    if (issue) return { status: 400, body: { ok: false, reason: issue } };
    if (typeof expected !== 'string' || !expected) return { status: 400, body: { ok: false, reason: 'the expected revision is required' } };
    if (!data || typeof data !== 'object' || !data.entries || typeof data.entries !== 'object') return { status: 400, body: { ok: false, reason: 'a lorebook needs an entries object' } };
    if (typeof worlds !== 'string' || !worlds) return { status: 500, body: { ok: false, reason: 'the user has no worlds folder' } };
    const file = path.resolve(worlds, `${name}.json`);
    if (path.dirname(file) !== path.resolve(worlds)) return { status: 400, body: { ok: false, reason: 'the name is not a plain file name' } };
    const current = readBook(file);
    if (!current) return { status: 409, body: { ok: false, conflict: true, missing: true } };
    const revision = lorebookRevision(current.entries);
    if (revision !== expected) return { status: 409, body: { ok: false, conflict: true, revision } };
    replaceFile(file, JSON.stringify(data, null, 4));
    return { status: 200, body: { ok: true, revision: lorebookRevision(data.entries) } };
}

export async function init(router) {
    router.get('/status', (_request, response) => response.json({ ok: true, version: PLUGIN_VERSION }));
    router.post('/commit', (request, response) => {
        try {
            const result = commitLorebook(request.user?.directories?.worlds, request.body);
            return response.status(result.status).json(result.body);
        } catch (error) {
            console.error('[story-orchestrator-lore] commit failed:', error?.message ?? String(error));
            return response.status(500).json({ ok: false, reason: 'the lorebook could not be written' });
        }
    });
    console.log(`[story-orchestrator-lore] loaded (v${PLUGIN_VERSION})`);
}

export async function exit() {
    return Promise.resolve();
}

export default { info, init, exit };
