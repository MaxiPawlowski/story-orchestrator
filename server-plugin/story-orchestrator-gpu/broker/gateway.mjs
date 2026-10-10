import http from 'node:http';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { ResponseTiming } from './responseTiming.mjs';

export const TEXT_ROUTES = Object.freeze(['/completion', '/v1/completions', '/v1/chat/completions', '/tokenize', '/detokenize', '/props', '/slots']);
const GENERATION_ROUTES = ['/completion', '/v1/completions', '/v1/chat/completions'];

export async function readBody(req, limit = 8 * 1024 * 1024) {
    const chunks = [];
    let length = 0;
    for await (const chunk of req) {
        length += chunk.length;
        if (length > limit) throw new Error('Request exceeds 8 MiB.');
        chunks.push(chunk);
    }
    const raw = Buffer.concat(chunks).toString('utf8');
    return raw ? JSON.parse(raw) : {};
}

const answer = (res, status, data) => {
    if (res.destroyed || res.headersSent) return;
    res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' });
    res.end(JSON.stringify(data));
};

export function createGateway({ arbiter, config, fetchImpl = fetch, allowOrigin = null, controls = null, extraGet = {} }) {
    let closing = false;
    const server = http.createServer(async (req, res) => {
        try {
            const origin = req.headers.origin;
            if (origin && !(allowOrigin && allowOrigin.test(origin))) { answer(res, 403, { error: 'The text gateway serves SillyTavern\'s server, not pages.' }); return; }
            const route = new URL(req.url, 'http://localhost').pathname;
            if (req.method === 'GET' && extraGet[route]) { answer(res, 200, await extraGet[route]()); return; }
            if (req.method === 'GET' && ['/', '/status', '/health'].includes(route)) { answer(res, 200, await arbiter.status({ fresh: true })); return; }
            if (controls && req.method === 'POST' && ['/lease', '/renew', '/release'].includes(route)) {
                const body = await readBody(req);
                const data = route === '/lease' ? await arbiter.reserve(body) : route === '/renew' ? { renewed: arbiter.renew(body.lease) } : { released: await arbiter.release(body.lease) };
                answer(res, 200, data);
                return;
            }
            if (controls && req.method === 'POST' && route.startsWith('/control/')) {
                const action = route.slice('/control/'.length);
                const body = await readBody(req);
                if (action === 'stop') { await controls.stop(); answer(res, 200, { stopped: true }); return; }
                answer(res, 200, await arbiter.control(action, body));
                return;
            }
            if (req.method === 'GET' && route === '/v1/models') {
                answer(res, 200, { object: 'list', data: [{ id: config.modelAlias, object: 'model', owned_by: 'llamacpp', meta: { n_ctx_train: config.maxContext } }] });
                return;
            }
            if (req.method === 'GET' && route === '/props') {
                answer(res, 200, { default_generation_settings: { n_ctx: config.maxContext }, total_slots: 1 });
                return;
            }
            if (!TEXT_ROUTES.includes(route)) { answer(res, 404, { error: 'Unknown route.' }); return; }
            if (closing) throw new Error('The broker is stopping.');
            const body = req.method === 'POST' ? await readBody(req) : null;
            const abort = new AbortController();
            res.once('close', () => { if (!res.writableEnded) abort.abort(); });
            const backend = arbiter.backend;
            await arbiter.text(async () => {
                if (body && GENERATION_ROUTES.includes(route)) await backend.forRequest(body, abort.signal);
                else await backend.ensure(backend.profile ?? config.defaultProfile);
                const response = await fetchImpl(`${backend.url}${route}`, { method: req.method, headers: { 'content-type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}), signal: abort.signal });
                if (res.destroyed) return;
                res.writeHead(response.status, { 'content-type': response.headers.get('content-type') ?? 'application/json', 'cache-control': 'no-store' });
                if (response.body) {
                    const timing = new ResponseTiming(response.headers.get('content-type')?.includes('text/event-stream'));
                    await pipeline(Readable.fromWeb(response.body), timing, res);
                    if (response.ok && timing.timings) await arbiter.scheduler.recordTiming({ timings: timing.timings }).catch((error) => { arbiter.scheduler.lastError = error.message; });
                } else res.end();
            }, abort.signal, GENERATION_ROUTES.includes(route) ? Number(body?.n_predict ?? body?.max_tokens ?? 1400) : null);
        } catch (error) { answer(res, 409, { error: { message: error.message, type: 'local_residency' } }); }
    });
    return {
        server,
        listen(port, host = '127.0.0.1') {
            return new Promise((resolve, reject) => {
                server.once('error', reject);
                server.listen(port, host, () => { server.off('error', reject); resolve(server.address()); });
            });
        },
        close() { closing = true; return new Promise((resolve) => server.close(() => resolve())); },
    };
}
