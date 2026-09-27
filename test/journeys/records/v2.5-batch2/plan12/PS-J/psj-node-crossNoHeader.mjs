import http from 'node:http';
const HOST = '127.0.0.1', PORT = 8101, base = '/api/plugins/story-orchestrator-judge/systemone';
const tokRes = await fetch(`http://${HOST}:${PORT}/csrf-token`);
const cookie = (tokRes.headers.getSetCookie?.() ?? []).map((c) => c.split(';')[0]).join('; ');
const { token } = await tokRes.json();
const body = JSON.stringify({ state: { errand: 'psj-node', count: 1 }, questions: { q: { type: 'noul', instructions: 'Is the count exactly one?' } } });
const post = (headers, payload) => new Promise((resolve) => {
  const t0 = Date.now();
  const req = http.request({ host: HOST, port: PORT, path: base, method: 'POST', agent: false, headers: { Cookie: cookie, 'X-CSRF-Token': token, 'Content-Length': Buffer.byteLength(payload), ...headers } }, (res) => {
    let text = ''; res.on('data', (c) => { text += c; }); res.on('end', () => resolve({ status: res.statusCode, ms: Date.now() - t0, text: text.slice(0, 160) }));
  });
  req.on('error', (e) => resolve({ error: String(e), ms: Date.now() - t0 }));
  req.end(payload);
});
const plain = { 'Content-Type': 'text/plain;charset=UTF-8', 'X-SO-Plugin': '1' };
const out = { csrfTokenLength: token?.length ?? 0, cookie: Boolean(cookie) };


out.crossNoHeader = await post({ 'Content-Type': 'text/plain;charset=UTF-8', Origin: 'http://evil.example', 'Sec-Fetch-Site': 'cross-site' }, body);


out.sameOriginHeader = await post({ ...plain, Origin: `http://${HOST}:${PORT}`, 'Sec-Fetch-Site': 'same-origin' }, body);
console.log(JSON.stringify(out, null, 2));
