import { DownloadError, PROVIDERS, testKey } from './downloads.mjs';

export const isAdmin = (req) => req?.user?.profile?.admin === true;
const userOf = (req) => String(req?.user?.profile?.handle ?? 'default-user');

const only = (body, keys) => {
    const input = body && typeof body === 'object' && !Array.isArray(body) ? body : {};
    const extra = Object.keys(input).filter((key) => !keys.includes(key));
    if (extra.length) throw new DownloadError(`This route takes ${keys.join(', ')} only; a URL or a path is never accepted (${extra.join(', ')}).`);
    return input;
};

const provider = (value) => {
    if (!Object.hasOwn(PROVIDERS, value)) throw new DownloadError('Choose civitai or huggingface.');
    return value;
};

export function mountDownloadRoutes(router, { downloads, readKey, fetchImpl = fetch, log = () => {} }) {
    const admin = (method, route, run) => router[method](route, async (req, res) => {
        if (!isAdmin(req)) return res.status(403).json({ error: 'Model downloads are admin-only: they write to the server\'s disk.' });
        try { res.json(await run(req)); }
        catch (error) {
            const status = error instanceof DownloadError ? error.status : 500;
            const message = error instanceof DownloadError ? error.message : 'The model request failed.';
            if (!(error instanceof DownloadError)) log(`model route ${route} failed: ${error?.name ?? 'Error'}`);
            res.status(status).json({ error: message });
        }
    });
    router.get('/models/keys', async (req, res) => {
        if (!req?.user) return res.status(401).json({ error: 'Sign in to SillyTavern first.' });
        const set = async (id) => Boolean(await readKey(req, id).catch(() => null));
        res.json({ civitai: await set('civitai'), huggingface: await set('huggingface') });
    });
    admin('post', '/models/test-key', async (req) => {
        const input = only(req.body, ['provider']);
        const id = provider(input.provider);
        return testKey({ provider: id, key: await readKey(req, id), fetchImpl });
    });
    admin('post', '/models/plan', async (req) => {
        const input = only(req.body, ['provider', 'ref', 'kind', 'root']);
        if (input.root !== undefined && !Number.isInteger(input.root)) throw new DownloadError('root is the index of a configured folder, not a path.');
        if (input.kind !== undefined && typeof input.kind !== 'string') throw new DownloadError('kind must be a model kind.');
        const id = provider(input.provider);
        return downloads.plan({ user: userOf(req), provider: id, ref: input.ref, kind: input.kind, root: input.root ?? 0, key: await readKey(req, id) });
    });
    admin('post', '/models/download', async (req) => {
        const input = only(req.body, ['planId']);
        if (typeof input.planId !== 'string') throw new DownloadError('planId is required.');
        const card = downloads.planFor?.(input.planId);
        return downloads.start({ user: userOf(req), planId: input.planId, key: card ? await readKey(req, card.provider) : null });
    });
    admin('get', '/models/jobs', async (req) => ({ jobs: downloads.list(userOf(req)) }));
    admin('post', '/models/cancel', async (req) => {
        const input = only(req.body, ['id']);
        return downloads.cancel({ user: userOf(req), id: String(input.id ?? '') });
    });
}
