// J11.9 diagnosis: the 5 seed pairs (+ the 5 duplicates of the walk's candidates) sent the way
// judgePairRelations sends them (PAIR_CONCURRENCY = 8 in one Promise.all), then M07 alone, over the product transport shape.
const base = '/api/plugins/story-orchestrator-judge/systemone';
const headers = { ...SillyTavern.getContext().getRequestHeaders(), 'Content-Type': 'text/plain;charset=UTF-8', 'X-SO-Plugin': '1' };
const PAIR_CRITERIA = {
  duplicate: 'The newer note restates the older one: the same fact about the same person, object or place, possibly reworded or with extra detail. Keeping both is redundant',
  update: 'The newer note gives a new value for the very same fact about the very same person, object or place (a price that changed, someone who moved or died), so the older note is now out of date',
  distinct: 'Worded alike or about the same character, but the notes concern a different object, a different person or a different fact, so both stay true',
  unrelated: 'The notes are about different subjects',
};
const SAME = { true: 'Both notes are about one and the same person, object or place, and the same property of it', false: 'The notes are about different things, even if they share an owner, a place or most of their words: a sword and a dagger, the silver and the frames, one person and another' };
const req = (older, newer) => ({ model: 'jev-1.13.0', state: { older_note: older, newer_note: newer }, questions: { relation: { type: 'choice', instructions: 'Compare `older_note` and `newer_note`, two notes from the same story\'s memory. What is the relationship between them?', criteria: PAIR_CRITERIA }, same_thing: { type: 'noul', instructions: 'Are `older_note` and `newer_note` about one and the same person, object or place, and the same property of it?', criteria: SAME } } });
const seed = [['M01', "Arin carries a curved blade she took from a pirate captain.", "Arin's sword is a curved blade taken from a pirate captain."], ['M07', 'The payoffs to the harbor police come from Maeve.', 'The payoffs to the harbor police trace back to the dockmaster, not Maeve.'], ['M08', 'Tommy Sayer is hiding at the safehouse on Pier Street.', "Tommy Sayer's brother is hiding at the safehouse on Pier Street."], ['P21', "Mira's lantern burns whale oil.", "Mira's stove burns whale oil."], ['P31', 'El libro de cuentas apareció en Pike Street.', 'Encontraron el libro de cuentas en la lavandería de Pike Street.']];
const call = async (id, older, newer) => { const t0 = performance.now(); const r = await fetch(base, { method: 'POST', headers, body: JSON.stringify(req(older, newer)) }); const body = await r.json().catch(() => null); return { id, status: r.status, ms: Math.round(performance.now() - t0), relation: body?.answers?.relation?.choice ?? null, confidence: body?.answers?.relation?.confidence ?? null, sameThing: body?.answers?.same_thing?.noul ?? null, error: body?.error ?? null }; };
const wave = [...seed, ...seed.slice(0, 3).map(([id, a, b]) => [`${id}-rev`, b, a])];
const parallel = await Promise.all(wave.map(([id, a, b]) => call(id, a, b)));
await new Promise((r) => setTimeout(r, 1000));
const m07 = seed[1];
const serialM07 = await call('M07-serial', m07[1], m07[2]);
return { parallel, admitted: parallel.filter((x) => x.status === 200).length, refused: parallel.filter((x) => x.status === 429).length, m07InWave: parallel.find((x) => x.id === 'M07'), serialM07 };
