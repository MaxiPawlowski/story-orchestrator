const ctx = SillyTavern.getContext();
const post = (path, body) => fetch(path, { method: 'POST', headers: ctx.getRequestHeaders(), body: JSON.stringify(body) });
const seed = 'The old stone bridge over the river collapsed in the flood and is gone.';
const claims = ['The old stone bridge over the river is still standing and intact.', 'The old stone bridge over the river is intact and usable.', 'Luke is uncertain about the river crossing, noting the current looks different and the old stone bridge is missing.', 'I crossed the old stone bridge over the river this morning. It held firm under my boots, same as ever.'];
const out = [];
for (const claim of claims) {
  const collectionId = `so_cosine_probe_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
  const ins = await post('/api/vector/insert', { collectionId, items: [{ hash: 0, text: seed, index: 0 }, { hash: 1, text: claim, index: 1 }], source: 'transformers' });
  if (!ins.ok) { out.push({ claim, error: 'insert ' + ins.status }); continue; }
  const hits = async (text, target, t) => { const r = await post('/api/vector/query', { collectionId, searchText: text, topK: 2, threshold: t, source: 'transformers' }); const d = await r.json(); return (d.metadata ?? []).some((m) => m.index === target); };
  const bisect = async (text, target) => { let lo = 0, hi = 1; for (let k = 0; k < 14; k += 1) { const mid = (lo + hi) / 2; if (await hits(text, target, mid)) lo = mid; else hi = mid; } return Number(lo.toFixed(4)); };
  const claimToSeed = await bisect(claim, 0);
  const seedToClaim = await bisect(seed, 1);
  const at = { dup082: await hits(claim, 0, 0.82), same055: await hits(claim, 0, 0.55) };
  await post('/api/vector/purge', { collectionId });
  out.push({ claim, claimToSeed, seedToClaim, ...at });
}
return { vectorsCapability: await globalThis.storyOrchestratorRuntime?.getSnapshot?.()?.capabilities ?? null, out };
