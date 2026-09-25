const J = globalThis.storyOrchestratorJudge;
if (!J) throw new Error('storyOrchestratorJudge missing');
const orig = window.fetch;
let sent = 0;
window.fetch = function (url, init) { if (String(url).includes('/api/plugins/story-orchestrator-judge/systemone')) sent++; return orig.apply(this, arguments); };
const run = globalThis.__soTokenGuardRun = (globalThis.__soTokenGuardRun ?? 0) + 1;
try {
  const big = { note: ('The caravan rolled on through the dunes of the southern waste, run ' + run + '. ').repeat(1520) };
  sent = 0;
  const over = await J.probe({ state: big, questions: { q: { type: 'noul', instructions: 'Is the caravan moving?' } } });
  const overSent = sent;
  sent = 0;
  const small = await J.probe({ state: { reply: `Guard check ${Date.now()}: the caravan stopped at the oasis.` }, questions: { q: { type: 'noul', instructions: 'Did the caravan stop?' } } });
  const smallSent = sent;
  const bigBody = { state: { note: 'x '.repeat(66000) }, questions: { q1: { type: 'noul', instructions: '' } } };
  const t = Date.now();
  const direct = await orig('/api/plugins/story-orchestrator-judge/systemone', { method: 'POST', headers: SillyTavern.getContext().getRequestHeaders(), body: JSON.stringify(bigBody) });
  const directBody = await direct.text();
  return {
    over: { fallback: over.fallback ?? null, answers: over.answers ?? null, stateChars: JSON.stringify(big).length, sent: overSent },
    small: { fallback: small.fallback ?? null, model: small.model ?? null, p: small.answers?.q?.noul ?? null, inputTokens: small.usage?.inputTokens ?? small.usage?.input_tokens ?? null, cached: small.cached ?? null, sent: smallSent },
    pluginDirect: { status: direct.status, ms: Date.now() - t, body: directBody.slice(0, 300) },
  };
} finally { window.fetch = orig; }
