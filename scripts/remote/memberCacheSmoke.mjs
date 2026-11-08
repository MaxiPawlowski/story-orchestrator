const args = process.argv.slice(2);
const flag = (name, fallback) => { const at = args.indexOf(name); return at >= 0 && args[at + 1] ? args[at + 1] : fallback; };
const base = args.find((arg) => /^https?:\/\//.test(arg)) ?? 'http://127.0.0.1:18890';
const chars = Number(flag('--chars', '20000'));
const rounds = Number(flag('--rounds', '2'));
const predict = Number(flag('--n-predict', '16'));

const story = (seed) => Array.from({ length: Math.ceil(chars / 120) }, (_, i) => `<|turn>user\nTurn ${i} of the shared scene ${seed}: the caravan moves on through the dunes at dusk.<turn|>\n`).join('').slice(0, chars);
const head = (name) => `<|turn>system\nYou are ${name}. ${`${name} speaks in short, careful sentences and remembers every promise made to the caravan. `.repeat(12)}<turn|>\n`;
const recent = ['The wind rises.', 'A lantern goes out at the back of the line.', 'Someone hums an old marching song.', 'The scout returns without her horse.']
    .map((line) => `<|turn>user\n${line} Everyone looks to the front of the caravan and waits for an answer.<turn|>\n`).join('');
const prompt = (name) => `${head(name)}${story('alpha')}<|turn>system\n[Author's note: keep ${name}'s reply under three sentences.]<turn|>\n${recent}<|turn>user\nWhat do you do next, ${name}?<turn|>\n<|turn>model\n`;

async function streamed(name) {
    const began = performance.now();
    const response = await fetch(`${base}/completion`, { method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ prompt: prompt(name), n_predict: predict, temperature: 0, stream: true, cache_prompt: true }) });
    if (!response.ok) throw new Error(`${name}: /completion answered ${response.status} ${await response.text()}`);
    const text = await response.text();
    const last = text.split('\n').filter((line) => line.startsWith('data: ')).map((line) => { try { return JSON.parse(line.slice(6)); } catch { return null; } }).filter(Boolean).at(-1);
    return { name, ms: Math.round(performance.now() - began), promptN: last?.timings?.prompt_n ?? null, cacheN: last?.timings?.cache_n ?? null };
}

const status = async () => (await (await fetch(`${base}/status`)).json()).memberCache;
const before = await status();
if (!before) throw new Error('memberCache is off on this controller');
const rows = [];
for (let round = 0; round < rounds; round += 1) for (const name of ['Mira', 'Tavish']) {
    const row = await streamed(name);
    const now = await status();
    rows.push({ round, ...row, hits: now.hits, misses: now.misses, occupancy: now.occupancy });
    console.log(JSON.stringify(rows.at(-1)));
}
const after = await status();
const summary = { prompts: rows.length, chars: prompt('Mira').length, planned: after.planned - (before.planned ?? 0), hits: after.hits - (before.hits ?? 0), misses: after.misses - (before.misses ?? 0),
    serverKeys: after.serverKeys, occupancy: after.occupancy, lastError: after.lastError ?? null };
console.log(JSON.stringify(summary));
const expected = (rounds - 1) * 2;
if (summary.planned < rows.length || summary.hits < expected) { console.error(`FAIL: expected ${rows.length} planned and at least ${expected} hits`); process.exit(1); }
console.log(`OK: ${summary.hits} member-cache hits of ${rows.length} alternating prompts`);
