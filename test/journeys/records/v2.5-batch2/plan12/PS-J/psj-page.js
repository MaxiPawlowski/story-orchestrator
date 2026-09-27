const base = '/api/plugins/story-orchestrator-judge';
const h = SillyTavern.getContext().getRequestHeaders();
const body = (tag) => JSON.stringify({ state: { errand: tag, count: 1 }, questions: { q: { type: 'noul', instructions: 'Is the count exactly one?' } } });
const call = async (init) => { const t0 = performance.now(); const r = await fetch(`${base}/systemone`, { method: 'POST', ...init }); const text = await r.text(); return { status: r.status, ms: Math.round(performance.now() - t0), text: text.slice(0, 160) }; };
const plain = { ...h, 'Content-Type': 'text/plain;charset=UTF-8', 'X-SO-Plugin': '1' };
const out = {};
out.status = await (await fetch(`${base}/status`, { headers: h })).json();
out.control = await call({ headers: plain, body: body('psj-control-' + Date.now()) });
try { out.big5MB = await call({ headers: plain, body: 'x'.repeat(5 * 1024 * 1024) }); } catch (e) { out.big5MB = { fetchError: String(e) }; }
out.jsonTyped = await call({ headers: { ...h, 'Content-Type': 'application/json', 'X-SO-Plugin': '1' }, body: body('psj-json') });
out.noHeader = await call({ headers: { ...h, 'Content-Type': 'text/plain;charset=UTF-8' }, body: body('psj-nohdr') });
const noCsrf = { 'Content-Type': 'text/plain;charset=UTF-8', 'X-SO-Plugin': '1' };
out.noCsrf = await call({ headers: noCsrf, body: body('psj-nocsrf') });
await new Promise((r) => setTimeout(r, 1500));
const stamp = Date.now();
const par = await Promise.all(Array.from({ length: 20 }, (_, i) => call({ headers: plain, body: body(`psj-par-${stamp}-${i}`) })));
out.parallel = { statuses: par.map((p) => p.status), admitted: par.filter((p) => p.status !== 429).length, refused429: par.filter((p) => p.status === 429).length, sample429: par.find((p) => p.status === 429)?.text ?? null, admittedMs: par.filter((p) => p.status !== 429).map((p) => p.ms) };
return out;
