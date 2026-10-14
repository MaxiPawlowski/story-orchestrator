export const LANDMARK_DEFAULT_URL = 'http://127.0.0.1:8096';
export const MAX_LANDMARK_PNG = 24_000_000;
const LOOPBACK = new Set(['127.0.0.1', 'localhost', '[::1]']);

export function chooseLandmarkUrl(configured) {
    if (configured === undefined) return LANDMARK_DEFAULT_URL;
    let url;
    try { url = new URL(configured); } catch { return null; }
    return url.protocol === 'http:' && LOOPBACK.has(url.hostname) ? configured.replace(/\/$/, '') : null;
}

export function mountLandmarkRoutes(router, { configured, fetchImpl = fetch, timeoutMs = 120_000 }) {
    const url = chooseLandmarkUrl(configured);
    const unavailable = (reason = 'unavailable') => ({ ok: false, reason });
    router.get('/landmarks/status', async (req, res) => {
        if (!req?.user) return res.status(401).json({ error: 'Sign in to SillyTavern first.' });
        if (!url) return res.json(unavailable('not-loopback'));
        try {
            const response = await fetchImpl(`${url}/health`, { signal: AbortSignal.timeout(2_000) });
            const body = await response.json();
            res.json(response.ok && body?.ok === true ? { ok: true, model: String(body.model ?? ''), device: String(body.device ?? '') } : unavailable());
        } catch { res.json(unavailable()); }
    });
    router.post('/landmarks', async (req, res) => {
        if (!req?.user) return res.status(401).json({ error: 'Sign in to SillyTavern first.' });
        const body = req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : {};
        if (Object.keys(body).some((key) => key !== 'png') || typeof body.png !== 'string' || !body.png || body.png.length > MAX_LANDMARK_PNG || !/^[A-Za-z0-9+/]+={0,2}$/.test(body.png))
            return res.json(unavailable('bad-request'));
        if (!url) return res.json(unavailable('not-loopback'));
        let response;
        try {
            response = await fetchImpl(`${url}/v1/landmarks`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ png: body.png }), signal: AbortSignal.timeout(timeoutMs) });
        } catch { return res.json(unavailable()); }
        const answer = await response.json().catch(() => null);
        if (!answer || typeof answer !== 'object') return res.json(unavailable());
        if (answer.ok !== true) return res.json(unavailable(typeof answer.reason === 'string' ? answer.reason : 'detector-error'));
        res.json({ ok: true, width: answer.width, height: answer.height, faces: Array.isArray(answer.faces) ? answer.faces : [] });
    });
}
