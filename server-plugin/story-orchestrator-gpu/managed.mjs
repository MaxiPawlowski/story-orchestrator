const LOOPBACK = ['127.0.0.1', 'localhost', '[::1]', '::1'];
export const DEFAULT_BROKER_PORT = 18888;

export function brokerAddress(config = {}) {
    const listenHost = config.listenHost ?? '127.0.0.1';
    const listenPort = config.listenPort ?? DEFAULT_BROKER_PORT;
    if (!LOOPBACK.includes(listenHost)) throw new Error('The GPU broker text proxy must listen on a loopback address.');
    if (!Number.isInteger(listenPort) || listenPort < 1 || listenPort > 65535) throw new Error('The GPU broker listen port must be 1..65535.');
    return { listenHost, listenPort, controllerUrl: config.controllerUrl ?? `http://127.0.0.1:${DEFAULT_BROKER_PORT}` };
}

export function mountManagedRoutes(router, url, fetchImpl = fetch) {
    const target = new URL(url);
    if (!['127.0.0.1', 'localhost', '[::1]'].includes(target.hostname) || target.protocol !== 'http:') throw new Error('Managed GPU controller must be an HTTP loopback service.');
    const call = async (route, body) => {
        const response = await fetchImpl(new URL(route, target), body === undefined
            ? { signal: AbortSignal.timeout(15000) }
            : { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(600000) });
        const data = await response.json();
        if (!response.ok) throw new Error(typeof data.error === 'string' ? data.error : data.error?.message ?? `Controller answered ${response.status}.`);
        return data;
    };
    router.get('/status', async (_req, res) => {
        try { res.json(await call('/status')); }
        catch (error) { res.status(503).json({ adapter: 'managed', guarding: true, error: error.message }); }
    });
    for (const route of ['lease', 'renew', 'release']) router.post(`/${route}`, async (req, res) => {
        try {
            const data = await call(`/${route}`, req.body ?? {});
            if ((res.destroyed || res.writableEnded) && route === 'lease' && data.lease) await call('/release', { lease: data.lease });
            else if (!res.destroyed && !res.writableEnded) res.json(data);
        } catch (error) { if (!res.destroyed && !res.writableEnded) res.status(409).json({ error: error.message }); }
    });
}
