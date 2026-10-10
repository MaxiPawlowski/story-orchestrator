import { test } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { allowedHost, checkFormat, createDownloads, readRef, resolveModel, safeFileName, testKey } from './downloads.mjs';
import { mountDownloadRoutes } from './downloadRoutes.mjs';

const KEY = 'sk-PLANTED-0123456789abcdef';
const bytes = Buffer.from('safetensors-bytes-'.repeat(4096));
const sha = createHash('sha256').update(bytes).digest('hex');
const tmp = () => fs.mkdtemp(path.join(os.tmpdir(), 'so-dl-'));

const civitaiVersion = (overrides = {}) => ({
    id: 4242, modelId: 77, name: 'v1', baseModel: 'Illustrious',
    model: { name: 'Ink Lines', type: 'LORA', nsfw: false },
    files: [{ id: 9, name: 'ink-lines.safetensors', sizeKB: bytes.length / 1024, primary: true, metadata: { format: 'SafeTensor' },
        hashes: { SHA256: sha.toUpperCase() }, downloadUrl: 'https://civitai.com/api/download/models/4242' }],
    ...overrides,
});

function fakeProviders({ rangeSupported = true, body = bytes, redirect = 'https://civitai-delivery-worker-prod.abc123.r2.cloudflarestorage.com/file?sig=xyz', version = civitaiVersion(), hfEtag = sha } = {}) {
    const calls = [];
    const fetchImpl = async (url, options = {}) => {
        const target = new URL(url);
        const headers = Object.fromEntries(Object.entries(options.headers ?? {}).map(([k, v]) => [k.toLowerCase(), v]));
        calls.push({ host: target.hostname, path: target.pathname, auth: headers.authorization ?? null, range: headers.range ?? null, method: options.method ?? 'GET' });
        const ok = (data) => new Response(JSON.stringify(data), { status: 200, headers: { 'content-type': 'application/json' } });
        if (target.hostname === 'civitai.com' && target.pathname.startsWith('/api/v1/model-versions/')) return ok(version);
        if (target.hostname === 'civitai.com' && target.pathname === '/api/v1/me') return headers.authorization === `Bearer ${KEY}` ? ok({ id: 1 }) : new Response('', { status: 401 });
        if (target.hostname === 'huggingface.co' && target.pathname === '/api/whoami-v2') return headers.authorization ? ok({ name: 'x' }) : new Response('', { status: 401 });
        if (target.hostname === 'civitai.com' && target.pathname.startsWith('/api/download/')) return new Response(null, { status: 307, headers: { location: redirect } });
        if (target.hostname === 'huggingface.co' && options.method === 'HEAD') {
            if (target.pathname.includes('gated')) return new Response(null, { status: 401 });
            return new Response(null, { status: 302, headers: { location: 'https://cdn-lfs.hf.co/repo/file', 'x-linked-size': String(body.length), ...(hfEtag ? { 'x-linked-etag': `"${hfEtag}"` } : {}), 'x-repo-commit': 'abcdef0123456789' } });
        }
        if (target.hostname === 'huggingface.co') return new Response(null, { status: 302, headers: { location: 'https://cdn-lfs.hf.co/repo/file' } });
        if (/r2\.cloudflarestorage\.com$|cdn-lfs\.hf\.co$|evil\.example$/.test(target.hostname)) {
            const range = /bytes=(\d+)-/.exec(headers.range ?? '');
            if (range && rangeSupported) {
                const start = Number(range[1]);
                return new Response(body.subarray(start), { status: 206, headers: { 'content-range': `bytes ${start}-${body.length - 1}/${body.length}`, 'content-length': String(body.length - start) } });
            }
            return new Response(body, { status: 200, headers: { 'content-length': String(body.length) } });
        }
        throw new Error(`unexpected ${url}`);
    };
    return { fetchImpl, calls };
}

const setup = async ({ free = 100 * 1024 ** 3, providers = fakeProviders(), config = {} } = {}) => {
    const root = await tmp();
    const other = await tmp();
    const logs = [];
    const downloads = createDownloads({ config: { modelRoots: { loras: [root], checkpoints: [other] }, ...config }, fetchImpl: providers.fetchImpl,
        statfs: async () => ({ bavail: Math.floor(free / 4096), bsize: 4096 }), log: (line) => logs.push(line) });
    return { root, other, downloads, providers, logs };
};

test('references: no route takes a URL or a path; names, formats and hosts are checked', () => {
    assert.throws(() => readRef('civitai', { url: 'https://evil.example/x' }), /takes versionId and fileId only/);
    assert.throws(() => readRef('civitai', 'https://civitai.com/x'), /not a URL or a path/);
    assert.throws(() => readRef('huggingface', { repo: 'a/b', file: '../../etc/passwd' }), /inside the repository/);
    assert.throws(() => readRef('huggingface', { repo: 'a/b', file: 'x.safetensors', target: 'C:/Windows' }), /not target/);
    assert.throws(() => readRef('other', {}), /civitai or huggingface/);
    assert.deepEqual(readRef('huggingface', { repo: 'org/model', file: 'sub/m.safetensors' }), { repo: 'org/model', file: 'sub/m.safetensors', revision: 'main' });
    for (const bad of ['../x.safetensors', 'a/b.safetensors', 'C:\\x.safetensors', '.hidden.safetensors', '']) assert.throws(() => safeFileName(bad));
    assert.throws(() => checkFormat('model.ckpt'), /can run code/);
    assert.equal(checkFormat('model.ckpt', { allowPickle: true }), '.ckpt');
    assert.throws(() => checkFormat('model.zip'), /Unsupported/);
    assert.equal(allowedHost('civitai', 'civitai-delivery-worker-prod.abc123.r2.cloudflarestorage.com'), true);
    assert.equal(allowedHost('civitai', 'evil.r2.cloudflarestorage.com'), false);
    assert.equal(allowedHost('huggingface', 'cdn-lfs.hf.co'), true);
    assert.equal(allowedHost('huggingface', 'huggingface.co.evil.example'), false);
});

test('resolve: Civitai and Hugging Face metadata parse to name, size, sha256, terms; no hash is a refusal', async () => {
    const { fetchImpl } = fakeProviders();
    const civ = await resolveModel({ provider: 'civitai', ref: { versionId: 4242 }, key: KEY, fetchImpl });
    assert.deepEqual([civ.name, civ.sha256, civ.sizeBytes, civ.kind, civ.baseModel, civ.nsfw], ['ink-lines.safetensors', sha, bytes.length, 'loras', 'Illustrious', false]);
    assert.match(civ.termsUrl, /civitai\.com\/models\/77/);
    const hf = await resolveModel({ provider: 'huggingface', ref: { repo: 'org/model', file: 'm.safetensors' }, key: null, fetchImpl });
    assert.deepEqual([hf.name, hf.sha256, hf.sizeBytes], ['m.safetensors', sha, bytes.length]);
    const noHash = fakeProviders({ version: civitaiVersion({ files: [{ ...civitaiVersion().files[0], hashes: {} }] }) });
    await assert.rejects(resolveModel({ provider: 'civitai', ref: { versionId: 1 }, fetchImpl: noHash.fetchImpl }), /no SHA256/);
    await assert.rejects(resolveModel({ provider: 'huggingface', ref: { repo: 'o/m', file: 'm.safetensors' }, fetchImpl: fakeProviders({ hfEtag: null }).fetchImpl }), /no SHA256/);
    await assert.rejects(resolveModel({ provider: 'huggingface', ref: { repo: 'o/gated', file: 'm.safetensors' }, fetchImpl }), /gated/);
    const pickle = fakeProviders({ version: civitaiVersion({ files: [{ ...civitaiVersion().files[0], name: 'old.ckpt' }] }) });
    await assert.rejects(resolveModel({ provider: 'civitai', ref: { versionId: 1 }, fetchImpl: pickle.fetchImpl }), /can run code/);
    const offHost = fakeProviders({ version: civitaiVersion({ files: [{ ...civitaiVersion().files[0], downloadUrl: 'https://evil.example/x' }] }) });
    await assert.rejects(resolveModel({ provider: 'civitai', ref: { versionId: 1 }, fetchImpl: offHost.fetchImpl }), /unexpected host/);
});

test('download: verified, into the chosen root only, the token never sent across hosts', async () => {
    const { root, other, downloads, providers } = await setup();
    const card = await downloads.plan({ user: 'u', provider: 'civitai', ref: { versionId: 4242 }, key: KEY });
    assert.equal(card.root, path.resolve(root));
    assert.equal(card.fits, true);
    assert.equal('downloadUrl' in card, false);
    downloads.start({ user: 'u', planId: card.id, key: KEY });
    await downloads.idle();
    const [job] = downloads.list('u');
    assert.equal(job.state, 'done', job.error);
    assert.equal(createHash('sha256').update(await fs.readFile(path.join(root, 'ink-lines.safetensors'))).digest('hex'), sha);
    assert.deepEqual(await fs.readdir(root), ['ink-lines.safetensors']);
    assert.deepEqual(await fs.readdir(other), []);
    for (const call of providers.calls) assert.equal(call.auth !== null, call.host === 'civitai.com', `${call.host} ${call.path}`);
    const again = await downloads.plan({ user: 'u', provider: 'civitai', ref: { versionId: 4242 }, key: KEY });
    assert.equal(again.present, true);
});

test('download: a free-space shortfall refuses before a byte is written, naming the numbers', async () => {
    const { root, downloads } = await setup({ free: bytes.length + 1024 });
    const card = await downloads.plan({ user: 'u', provider: 'civitai', ref: { versionId: 4242 }, key: KEY });
    assert.equal(card.fits, false);
    downloads.start({ user: 'u', planId: card.id, key: KEY });
    await downloads.idle();
    const [job] = downloads.list('u');
    assert.equal(job.state, 'failed');
    assert.match(job.error, /Not enough free space .* 2 GiB margin/);
    assert.deepEqual(await fs.readdir(root), []);
});

test('resume: a cancelled download continues with Range, and restarts when the server ignores Range', async () => {
    for (const rangeSupported of [true, false]) {
        const providers = fakeProviders({ rangeSupported });
        const { root, downloads } = await setup({ providers });
        const card = await downloads.plan({ user: 'u', provider: 'huggingface', ref: { repo: 'org/model', file: 'm.safetensors' }, kind: 'loras', key: KEY });
        await fs.writeFile(path.join(root, 'm.safetensors.part'), bytes.subarray(0, 1000));
        await fs.writeFile(path.join(root, 'm.safetensors.part.json'), JSON.stringify({ sha256: sha }));
        downloads.start({ user: 'u', planId: card.id, key: KEY });
        await downloads.idle();
        assert.equal(downloads.list('u')[0].state, 'done', downloads.list('u')[0].error);
        const ranged = providers.calls.filter((call) => call.range);
        assert.equal(ranged.length > 0, true);
        assert.equal(createHash('sha256').update(await fs.readFile(path.join(root, 'm.safetensors'))).digest('hex'), sha);
        assert.deepEqual(await fs.readdir(root), ['m.safetensors']);
    }
});

test('a sha256 mismatch deletes the partial file and installs nothing', async () => {
    const providers = fakeProviders({ body: Buffer.from('x'.repeat(bytes.length)) });
    const { root, downloads } = await setup({ providers });
    const card = await downloads.plan({ user: 'u', provider: 'civitai', ref: { versionId: 4242 }, key: KEY });
    downloads.start({ user: 'u', planId: card.id, key: KEY });
    await downloads.idle();
    assert.match(downloads.list('u')[0].error, /did not match its SHA256/);
    assert.deepEqual(await fs.readdir(root), []);
});

test('a redirect off the provider\'s hosts stops the download', async () => {
    const providers = fakeProviders({ redirect: 'https://evil.example/steal' });
    const { root, downloads } = await setup({ providers });
    const card = await downloads.plan({ user: 'u', provider: 'civitai', ref: { versionId: 4242 }, key: KEY });
    downloads.start({ user: 'u', planId: card.id, key: KEY });
    await downloads.idle();
    assert.match(downloads.list('u')[0].error, /redirected to a host outside/);
    assert.equal(providers.calls.some((call) => call.host === 'evil.example'), false);
    assert.deepEqual((await fs.readdir(root)).filter((name) => !name.endsWith('.json')), []);
});

test('an existing file of the same name with other bytes is never overwritten; a symlink is refused', async () => {
    const { root, downloads } = await setup();
    await fs.writeFile(path.join(root, 'ink-lines.safetensors'), 'mine');
    await assert.rejects(downloads.plan({ user: 'u', provider: 'civitai', ref: { versionId: 4242 }, key: KEY }), /never overwritten/);
    assert.equal(await fs.readFile(path.join(root, 'ink-lines.safetensors'), 'utf8'), 'mine');
    const missing = await setup({ config: { modelRoots: {} } });
    await assert.rejects(missing.downloads.plan({ user: 'u', provider: 'civitai', ref: { versionId: 4242 }, key: KEY }), /No folder is configured for loras/);
});

test('key test answers ok or refused, never the key', async () => {
    const { fetchImpl } = fakeProviders();
    assert.deepEqual(await testKey({ provider: 'civitai', key: KEY, fetchImpl }), { ok: true, set: true, message: 'The provider accepted the token.' });
    assert.deepEqual(await testKey({ provider: 'civitai', key: 'wrong', fetchImpl }), { ok: false, set: true, message: 'The provider refused the token.' });
    assert.deepEqual(await testKey({ provider: 'huggingface', key: null, fetchImpl }), { ok: false, set: false, message: 'No token is stored.' });
});

test('routes: admin-only, no URL or path accepted, and the planted key never appears in a response or a log line', async () => {
    const { downloads, logs } = await setup();
    const handlers = new Map();
    const router = { get: (route, fn) => handlers.set(`GET ${route}`, fn), post: (route, fn) => handlers.set(`POST ${route}`, fn) };
    mountDownloadRoutes(router, { downloads, readKey: async () => KEY, fetchImpl: fakeProviders().fetchImpl, log: (line) => logs.push(line) });
    const call = async (key, req) => {
        const res = { code: 200, data: null, status(code) { this.code = code; return this; }, json(data) { this.data = data; return this; } };
        await handlers.get(key)({ user: { profile: { admin: true }, directories: {} }, body: {}, query: {}, ...req }, res);
        return res;
    };
    const nonAdmin = { user: { profile: { admin: false }, directories: {} } };
    for (const route of ['POST /models/plan', 'POST /models/download', 'POST /models/cancel', 'GET /models/jobs', 'POST /models/test-key']) assert.equal((await call(route, nonAdmin)).code, 403, route);
    const keys = await call('GET /models/keys', nonAdmin);
    assert.deepEqual(keys.data, { civitai: true, huggingface: true });
    assert.equal((await call('POST /models/plan', { body: { provider: 'civitai', ref: { versionId: 4242 }, url: 'https://evil.example' } })).code, 400);
    assert.equal((await call('POST /models/plan', { body: { provider: 'civitai', ref: { versionId: 4242 }, root: 'C:/Windows' } })).code, 400);
    const card = await call('POST /models/plan', { body: { provider: 'civitai', ref: { versionId: 4242 } } });
    assert.equal(card.code, 200, JSON.stringify(card.data));
    const started = await call('POST /models/download', { body: { planId: card.data.id } });
    assert.equal(started.code, 200);
    await downloads.idle();
    const tested = await call('POST /models/test-key', { body: { provider: 'civitai' } });
    assert.equal(tested.data.ok, true);
    const everything = JSON.stringify([keys.data, card.data, started.data, tested.data, (await call('GET /models/jobs', {})).data, logs]);
    assert.equal(everything.includes(KEY), false);
    assert.equal(everything.includes('sig=xyz'), false);
});

test('keys come only from ST secrets, per user, never from the environment', async () => {
    const { readProviderKey } = await import('./index.mjs');
    process.env.CIVITAI_TOKEN = 'env-token';
    process.env.HF_TOKEN = 'env-token';
    const store = { readSecret: (directories, key) => (directories.root === 'alice' && key === 'so_civitai_token' ? ` ${KEY} ` : key === 'api_key_huggingface' && directories.root === 'alice' ? 'hf-1' : '') };
    assert.equal(await readProviderKey({ user: { directories: { root: 'alice' } } }, 'civitai', store), KEY);
    assert.equal(await readProviderKey({ user: { directories: { root: 'alice' } } }, 'huggingface', store), 'hf-1');
    assert.equal(await readProviderKey({ user: { directories: { root: 'bob' } } }, 'civitai', store), null);
    assert.equal(await readProviderKey({ user: {} }, 'civitai', store), null);
    delete process.env.CIVITAI_TOKEN;
    delete process.env.HF_TOKEN;
});
