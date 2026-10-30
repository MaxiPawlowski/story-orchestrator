import http from 'node:http';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { ResponseTiming } from './responseTiming.mjs';
import { ContextRefusal, draftCap, slotFor, slots } from './backend.mjs';
import { PromptReuse, promptReuseOptions } from './promptReuse.mjs';
import { MemberCache, memberCacheOptions } from './memberCache.mjs';

export const TEXT_ROUTES = Object.freeze(['/completion', '/v1/completions', '/v1/chat/completions', '/tokenize', '/detokenize', '/props', '/slots']);
const GENERATION_ROUTES = ['/completion', '/v1/completions', '/v1/chat/completions'];
const COUNTING_ROUTES = ['/tokenize', '/detokenize'];

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

export function createGateway({ arbiter, config, fetchImpl = fetch, allowOrigin = null, controls = null, extraGet = {}, routes = null, promptReuse = undefined, memberCache = undefined }) {
    let closing = false;
    const reuseOptions = promptReuseOptions(config);
    const reuse = promptReuse !== undefined ? promptReuse : reuseOptions ? new PromptReuse(slots(config) ? { ...reuseOptions, history: 1 } : reuseOptions) : null;
    const idle = () => !(arbiter.scheduler?.pending?.length > 0);
    const memberOptions = memberCacheOptions(config);
    const members = memberCache !== undefined ? memberCache : memberOptions ? new MemberCache({ ...memberOptions, pinSlots: Boolean(slots(config)) }, { fetch: fetchImpl, baseUrl: () => arbiter.backend.url,
        snapshot: arbiter.scheduler?.snapshot ? () => arbiter.scheduler.snapshot({ fresh: true }) : null, reserves: () => config.reserves ?? {},
        live: () => memberCacheOptions(config), ramFloorMiB: () => config.keepCacheRamFloorMiB ?? 10240, imageRamMiB: () => arbiter.scheduler?.warmImageRamMiB?.() ?? 0 }) : null;
    const membersReady = members?.init ? members.init().catch((error) => { members.lastError = error.message; }) : null;
    if (members && arbiter.scheduler) arbiter.scheduler.onImageRam = (need) => members.makeRoom(need);
    if (members?.spillForRam && arbiter.scheduler) { arbiter.scheduler.onSpillForRam = (need) => members.spillForRam(need); arbiter.scheduler.onSleepingDropped = () => members.sweepSpilled(arbiter.backend.status().pid); }
    if (members && arbiter.backend) arbiter.backend.onSlotErased = (id) => members.noteOther(id);
    const memberIdle = () => idle() && !arbiter.scheduler?.imageQueued && !arbiter.scheduler?.imagePending;
    let idleTimer = null;
    const backendReady = () => { const state = arbiter.backend.status(); return Boolean(state.pid) && !state.loading; };
    const scheduleIdlePrefill = (slot) => {
        if (!members?.idlePrefill || members.store !== 'ram' || !members.runIdlePrefill) return;
        clearTimeout(idleTimer);
        idleTimer = setTimeout(() => {
            if (closing || !memberIdle() || !backendReady()) return;
            const stop = new AbortController();
            const unsubscribe = arbiter.scheduler?.onArrival?.(() => stop.abort()) ?? (() => {});
            const signal = AbortSignal.any([stop.signal, AbortSignal.timeout(120000)]);
            const stillIdle = () => !stop.signal.aborted && memberIdle();
            arbiter.text(async () => { if (backendReady() && stillIdle()) await members.runIdlePrefill({ idle: stillIdle, slot, signal }); }, stop.signal, null, 'idle')
                .catch((error) => { if (!stop.signal.aborted) members.lastError = error.message; })
                .finally(unsubscribe);
        }, members.idleDelayMs ?? 3000);
        idleTimer.unref?.();
    };
    const server = http.createServer(async (req, res) => {
        try {
            const route = new URL(req.url, 'http://localhost').pathname;
            if (routes && await routes(req, res, route)) return;
            const origin = req.headers.origin;
            if (origin && !(allowOrigin && allowOrigin.test(origin))) { answer(res, 403, { error: 'The text gateway serves SillyTavern\'s server, not pages.' }); return; }
            if (req.method === 'GET' && extraGet[route]) { answer(res, 200, await extraGet[route]()); return; }
            if (req.method === 'GET' && ['/', '/status', '/health'].includes(route)) { answer(res, 200, await arbiter.status({ fresh: true })); return; }
            if (controls && req.method === 'POST' && ['/lease', '/renew', '/release', '/burst'].includes(route)) {
                const body = await readBody(req);
                const data = route === '/lease' ? await arbiter.reserve(body) : route === '/renew' ? { renewed: arbiter.renew(body.lease) } : route === '/burst' ? arbiter.burst(body) : { released: await arbiter.release(body.lease) };
                answer(res, 200, data);
                return;
            }
            if (controls && req.method === 'POST' && route.startsWith('/control/')) {
                const action = route.slice('/control/'.length);
                const body = await readBody(req);
                if (action === 'stop') { answer(res, 200, { stopped: true, ...(await controls.stop(body)) }); return; }
                answer(res, 200, await arbiter.control(action, body));
                return;
            }
            if (req.method === 'GET' && route === '/v1/models') {
                answer(res, 200, { object: 'list', data: [{ id: config.modelAlias, object: 'model', owned_by: 'llamacpp', meta: { n_ctx_train: arbiter.backend.servedContext() } }] });
                return;
            }
            if (req.method === 'GET' && route === '/props') {
                const backend = arbiter.backend;
                let props = {};
                if (backend.status().pid && !backend.status().loading) {
                    try { const reply = await fetchImpl(`${backend.url}/props`, { signal: AbortSignal.timeout(2000) }); if (reply.ok) props = await reply.json(); } catch {}
                }
                answer(res, 200, { chat_template: '', ...props, default_generation_settings: { ...(props.default_generation_settings ?? {}), n_ctx: backend.servedContext() }, total_slots: slots(config)?.count ?? 1 });
                return;
            }
            if (!TEXT_ROUTES.includes(route)) { answer(res, 404, { error: 'Unknown route.' }); return; }
            if (closing) throw new Error('The broker is stopping.');
            const body = req.method === 'POST' ? await readBody(req) : null;
            const abort = new AbortController();
            res.once('close', () => { if (!res.writableEnded) abort.abort(); });
            const backend = arbiter.backend;
            const generating = req.method === 'POST' && body && GENERATION_ROUTES.includes(route);
            const slot = generating ? (Number.isInteger(body.id_slot) && body.id_slot >= 0 ? body.id_slot : slotFor(config, body)) : null;
            const replying = generating && body?.stream === true;
            const arrivedAt = Date.now();
            const arrival = backend.status();
            const coldArrival = replying && (!arrival.pid || Boolean(arrival.loading) || Boolean(arbiter.scheduler?.lease));
            if (slot !== null) body.id_slot = slot;
            const reusing = reuse && req.method === 'POST' && route === '/completion' && body;
            const backendCall = async (payload) => {
                const reply = await fetchImpl(`${backend.url}/completion`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload), signal: abort.signal });
                await reply.arrayBuffer();
                if (!reply.ok) throw new Error(`prompt reuse step answered ${reply.status}`);
            };
            let memberDone = false;
            const forward = async () => {
                let memberPlan = null;
                if (members && generating) {
                    await membersReady;
                    members.syncBackend?.(backend.status().pid);
                    if (route === '/completion') memberPlan = await members.before(body, slot ?? 0, abort.signal).catch((error) => { members.lastError = error.message; members.noteOther(slot ?? 0); return null; });
                    else members.noteOther(slot ?? 0);
                }
                const prefill = reusing && !memberPlan ? reuse.prefill(body, slot ?? 'all') : null;
                if (prefill) await backendCall(slot === null ? prefill : { ...prefill, id_slot: slot }).catch((error) => { reuse.lastError = error.message; });
                const cap = generating && body ? draftCap(config, body.stream === true) : null;
                if (cap !== null && body['speculative.n_max'] === undefined) body['speculative.n_max'] = cap;
                const response = await fetchImpl(`${backend.url}${route}`, { method: req.method, headers: { 'content-type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}), signal: abort.signal });
                if (res.destroyed) return;
                res.writeHead(response.status, { 'content-type': response.headers.get('content-type') ?? 'application/json', 'cache-control': 'no-store' });
                if (response.body) {
                    const timing = new ResponseTiming(response.headers.get('content-type')?.includes('text/event-stream'));
                    await pipeline(Readable.fromWeb(response.body), timing, res);
                    if (response.ok && timing.timings) await arbiter.scheduler.recordTiming({ timings: timing.timings }).catch((error) => { arbiter.scheduler.lastError = error.message; });
                } else res.end();
                memberDone = true;
                if (memberPlan && response.ok) {
                    await members.afterReply(memberPlan, { idle: memberIdle }).catch((error) => { members.lastError = error.message; members.noteOther(memberPlan.slot); });
                    scheduleIdlePrefill(memberPlan.slot);
                }
                else if (members?.afterOther && generating) await members.afterOther(slot ?? 0).catch((error) => { members.lastError = error.message; });
                const park = reusing && !memberPlan && response.ok && slot === null ? reuse.park(idle()) : null;
                if (park) await backendCall(park).catch((error) => { reuse.lastError = error.message; });
            };
            const state = backend.status();
            if (COUNTING_ROUTES.includes(route) && (backend.tryDirect ? backend.tryDirect() : Boolean(state.pid && !state.loading && state.profile))) {
                try { await forward(); } finally { backend.endDirect?.(); }
                return;
            }
            await arbiter.text(async () => {
                try {
                    if (body && GENERATION_ROUTES.includes(route)) await backend.forRequest(body, abort.signal, slot);
                    else await backend.ensure(backend.profile ?? config.defaultProfile);
                    if (replying) arbiter.scheduler?.noteReplyWait?.({ waitedMs: Date.now() - arrivedAt, cold: coldArrival });
                    try { await forward(); }
                    finally { if (!memberDone && members?.afterOther && generating && backend.status().pid) await members.afterOther(slot ?? 0).catch((error) => { members.lastError = error.message; }); }
                } finally { if (slot !== null) backend.releaseSlot?.(slot); }
            }, abort.signal, GENERATION_ROUTES.includes(route) ? Number(body?.n_predict ?? body?.max_tokens ?? 1400) : null, generating && body?.stream === true ? 'chat' : 'side');
        } catch (error) {
            if (error instanceof ContextRefusal) answer(res, 400, { error: { code: 400, message: error.message, type: 'exceed_context_size_error', n_prompt_tokens: error.promptTokens, n_ctx: error.context } });
            else answer(res, 409, { error: { message: error.message, type: 'local_residency' } });
        }
    });
    return {
        server,
        promptReuse: reuse,
        memberCache: members,
        listen(port, host = '127.0.0.1') {
            return new Promise((resolve, reject) => {
                server.once('error', reject);
                server.listen(port, host, () => { server.off('error', reject); resolve(server.address()); });
            });
        },
        close() { closing = true; clearTimeout(idleTimer); return new Promise((resolve) => server.close(() => resolve())); },
    };
}
