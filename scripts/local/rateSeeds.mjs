import { createHash } from 'node:crypto';

export const CATEGORIES = Object.freeze(['coherence', 'voice', 'guidance', 'continuity']);
export const FLAGS = Object.freeze(['voiceBleed', 'guidanceIgnored', 'leak']);
export const FLOORS = Object.freeze({ categoryDrop: 0.2, flagsPer25: 2, ratedShare: 0.8 });

const TURN = /<\|turn>(\w+)\n([\s\S]*?)<turn\|>\n/g;

export function split(text) {
    const at = text.indexOf('<channel|>');
    return at < 0 ? { closed: false, reply: text.trim() } : { closed: true, reply: text.slice(at + '<channel|>'.length).trim() };
}

export function material(prompt) {
    const turns = [...prompt.matchAll(TURN)].map((match) => ({ role: match[1], text: match[2] }));
    const speaker = prompt.slice(prompt.lastIndexOf('<|turn>model\n') + '<|turn>model\n'.length).split(':')[0].trim();
    const head = turns[0]?.text ?? '';
    const guidance = turns.slice(1).filter((turn) => turn.role === 'system').map((turn) => turn.text).join('\n---\n');
    const chat = turns.slice(1).filter((turn) => turn.role !== 'system').slice(-8).map((turn) => turn.text.trim()).join('\n\n');
    return { speaker, head, guidance, chat };
}

export const flipFor = (label, seed, index) => createHash('sha1').update(`${label}:${seed}:${index}`).digest()[0] % 2 === 1;

export const pairId = (seed, index) => `s${seed}-p${String(index).padStart(2, '0')}`;

export function ratingPrompt(m, x, y) {
    return `Two candidate replies were written by the same model for the same moment in a group roleplay. The character speaking is "${m.speaker}". Each reply must sound like ${m.speaker} only.

Cast cards and rules (reference only):
<<<
${m.head}
>>>

Guidance and memory the story engine injected for this reply (the model should use it where relevant):
<<<
${m.guidance}
>>>

Most recent chat messages (oldest first):
<<<
${m.chat}
>>>

Reply X:
<<<
${x.reply}
>>>

Reply Y:
<<<
${y.reply}
>>>

Rate each reply 1-5 on: coherence (readable, consistent, follows from the chat), voice (sounds like ${m.speaker} as their card sets them up, consistent with their earlier lines), guidance (uses the injected guidance and memory where relevant, does not contradict it), continuity (consistent with established facts, the scene and who is present). Flags per reply: voiceBleed true when the reply takes on another cast member's traits, voice or knowledge, or speaks or acts for them; guidanceIgnored true when it ignores or contradicts a specific relevant point of the injected guidance; leak true when planning notes, bullet-point thinking or instructions appear in the reply instead of the character's speech and narration. Then say which you prefer.

Answer only: {"X":{"coherence":n,"voice":n,"guidance":n,"continuity":n,"voiceBleed":bool,"guidanceIgnored":bool,"leak":bool},"Y":{same keys},"prefer":"X"|"Y"|"tie","why":"one sentence"}
`;
}

export function chatRows(lines, arm) {
    const rows = new Map();
    for (const line of lines.split('\n')) {
        if (!line.trim()) continue;
        const row = JSON.parse(line);
        if (row.kind !== 'chat' || !Number.isInteger(row.index) || (arm && row.arm !== arm)) continue;
        rows.set(row.index, row);
    }
    return rows;
}

export function validVerdict(verdict) {
    const side = (row) => row && CATEGORIES.every((key) => Number.isInteger(row[key]) && row[key] >= 1 && row[key] <= 5) && FLAGS.every((key) => typeof row[key] === 'boolean');
    return Boolean(verdict && side(verdict.X) && side(verdict.Y) && ['X', 'Y', 'tie'].includes(verdict.prefer));
}

export function unblind(verdict, flip) {
    const control = flip ? verdict.Y : verdict.X;
    const candidate = flip ? verdict.X : verdict.Y;
    const prefer = verdict.prefer === 'tie' ? 'tie' : (verdict.prefer === 'X') !== flip ? 'control' : 'candidate';
    return { control, candidate, prefer };
}

export function seededRandom(seed) {
    let state = seed >>> 0;
    return () => { state = (state + 0x6D2B79F5) >>> 0; let t = state; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

export function bootstrapDelta(rows, key, { resamples = 10000, seed = 27 } = {}) {
    if (!rows.length) return null;
    const deltas = rows.map((row) => row.candidate[key] - row.control[key]);
    const random = seededRandom(seed);
    const means = [];
    for (let draw = 0; draw < resamples; draw += 1) {
        let sum = 0;
        for (let pick = 0; pick < deltas.length; pick += 1) sum += deltas[Math.floor(random() * deltas.length)];
        means.push(sum / deltas.length);
    }
    means.sort((a, b) => a - b);
    return { low: +means[Math.floor(resamples * 0.025)].toFixed(3), high: +means[Math.ceil(resamples * 0.975) - 1].toFixed(3) };
}

export function summarize(rows, { label = null, expected = null } = {}) {
    const ok = rows.filter((row) => !row.error);
    const mean = (side, key) => ok.length ? ok.reduce((sum, row) => sum + row[side][key], 0) / ok.length : NaN;
    const count = (side, key) => ok.filter((row) => row[side][key] === true).length;
    const means = Object.fromEntries(CATEGORIES.map((key) => [key, { control: +mean('control', key).toFixed(3), candidate: +mean('candidate', key).toFixed(3), delta: +(mean('candidate', key) - mean('control', key)).toFixed(3) }]));
    const flags = Object.fromEntries(FLAGS.map((key) => [key, { control: count('control', key), candidate: count('candidate', key) }]));
    const notClosed = { control: ok.filter((row) => !row.control.closed).length, candidate: ok.filter((row) => !row.candidate.closed).length };
    const prefer = { control: ok.filter((row) => row.prefer === 'control').length, candidate: ok.filter((row) => row.prefer === 'candidate').length, tie: ok.filter((row) => row.prefer === 'tie').length };
    const total = expected ?? rows.length;
    const flagAllowance = Math.floor(FLOORS.flagsPer25 * ok.length / 25);
    const floors = {
        categories: ok.length > 0 && Object.values(means).every((row) => row.delta >= -FLOORS.categoryDrop),
        flags: Object.values(flags).every((row) => row.candidate <= row.control + flagAllowance),
        thinkingClosed: notClosed.candidate <= notClosed.control,
        rated: total > 0 && ok.length >= Math.ceil(total * FLOORS.ratedShare),
    };
    return { label, rated: ok.length, failed: rows.length - ok.length, expected: total, identicalPairs: ok.filter((row) => row.identical).length, means, flags, flagAllowance, notClosed, prefer, floors,
        pass: Object.values(floors).every(Boolean) };
}

export function aggregate(rows, { label = null, seeds = [], perSeed = 25 } = {}) {
    const expected = seeds.length ? seeds.length * perSeed : rows.length;
    const overall = summarize(rows, { label, expected });
    const ok = rows.filter((row) => !row.error);
    overall.bootstrap = Object.fromEntries(CATEGORIES.map((key) => [key, bootstrapDelta(ok, key)]));
    const bySeed = (seeds.length ? seeds : [...new Set(rows.map((row) => row.seed))]).map((seed) => ({ seed, ...summarize(rows.filter((row) => row.seed === seed), { expected: perSeed }) }));
    overall.seeds = bySeed.map(({ seed, rated, means, flags, notClosed, prefer, pass }) => ({ seed, rated, deltas: Object.fromEntries(CATEGORIES.map((key) => [key, means[key].delta])), flags, notClosed, prefer, pass }));
    overall.seedsPassing = bySeed.filter((row) => row.pass).length;
    return overall;
}
