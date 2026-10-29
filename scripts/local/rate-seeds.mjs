import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { aggregate, chatRows, flipFor, material, pairId, ratingPrompt, split, unblind, validVerdict } from './rateSeeds.mjs';

const [command, ...rest] = process.argv.slice(2);
const option = (name, fallback = null) => { const at = rest.indexOf(`--${name}`); return at >= 0 ? rest[at + 1] : fallback; };
const USAGE = `Usage:
  node scripts/local/rate-seeds.mjs manifest --root <bench dir> --control-arm <arm> --candidate-arm <arm> --out <manifest.json> [--label R2-multiseed] [--chat-cap 1024] [--since <iso>] [--include <dir,dir>]
  node scripts/local/rate-seeds.mjs rate <manifest.json> --out <dir> --owner-approved [--jobs 2] [--model gpt-6.1-sol]
  node scripts/local/rate-seeds.mjs aggregate <manifest.json> --out <dir>`;

const readJson = async (file) => JSON.parse(await fs.readFile(file, 'utf8'));

async function buildManifest() {
    const root = option('root');
    const controlArm = option('control-arm');
    const candidateArm = option('candidate-arm');
    const out = option('out');
    if (!root || !controlArm || !candidateArm || !out) throw new Error(USAGE);
    const chatCap = Number(option('chat-cap', 1024));
    const since = option('since');
    const dirs = (await fs.readdir(root)).filter((name) => name.startsWith('text-')).map((name) => path.join(root, name));
    for (const extra of (option('include') ?? '').split(',').filter(Boolean)) dirs.push(extra);
    const runs = [];
    for (const dir of dirs) {
        const header = await readJson(path.join(dir, 'header.json')).catch(() => null);
        if (!header || header.chatCap !== chatCap || (since && header.at < since && !(option('include') ?? '').includes(dir))) continue;
        const lines = await fs.readFile(path.join(dir, 'rows.jsonl'), 'utf8').catch(() => '');
        for (const arm of header.arms ?? []) {
            if (arm !== controlArm && arm !== candidateArm) continue;
            const rows = chatRows(lines, arm);
            if (!rows.size || [...rows.values()].some((row) => typeof row.text !== 'string')) continue;
            runs.push({ seed: header.seed, arm, dir: dir.replace(/\\/g, '/'), at: header.at, binary: header.binary, chats: rows.size });
        }
    }
    const seeds = new Map();
    for (const run of runs.sort((a, b) => a.at.localeCompare(b.at))) {
        const entry = seeds.get(run.seed) ?? { seed: run.seed };
        entry[run.arm === controlArm ? 'control' : 'candidate'] = { dir: run.dir, arm: run.arm, at: run.at, binary: run.binary, chats: run.chats };
        seeds.set(run.seed, entry);
    }
    const complete = [...seeds.values()].filter((entry) => entry.control && entry.candidate).sort((a, b) => a.seed - b.seed);
    const manifest = { label: option('label', 'R2-multiseed'), corpus: option('corpus', 'C:/dev/so-lanes/bench-controller/09/corpus-rate.json'), controlArm, candidateArm, chatCap, seeds: complete,
        incomplete: [...seeds.values()].filter((entry) => !(entry.control && entry.candidate)).map((entry) => entry.seed) };
    await fs.writeFile(out, JSON.stringify(manifest, null, 2));
    console.log(JSON.stringify({ seeds: complete.map((entry) => entry.seed), incomplete: manifest.incomplete }));
}

function codex(input, answer, cwd, model) {
    return new Promise((resolve, reject) => {
        const child = spawn('codex', ['exec', '-m', model, '-s', 'read-only', '--skip-git-repo-check', '-o', answer, '-'], { cwd, shell: true, stdio: ['pipe', 'ignore', 'pipe'], windowsHide: true });
        let stderr = '';
        const timer = setTimeout(() => { child.kill(); reject(new Error('codex exec timed out')); }, 600000);
        child.stderr.on('data', (chunk) => { stderr += chunk; });
        child.on('error', (error) => { clearTimeout(timer); reject(error); });
        child.on('exit', (code) => { clearTimeout(timer); if (code === 0) resolve(); else reject(new Error(`codex exec exited ${code}: ${stderr.slice(-300)}`)); });
        child.stdin.end(input);
    });
}

async function rate() {
    const manifestFile = rest[0];
    const out = option('out');
    if (!manifestFile || !out) throw new Error(USAGE);
    if (!rest.includes('--owner-approved')) throw new Error('The blind Sol rating is owner-gated (plan v3.0 27 W3): pass --owner-approved only after the owner says yes.');
    const manifest = await readJson(manifestFile);
    const corpus = await readJson(manifest.corpus);
    const model = option('model', 'gpt-6.1-sol');
    const jobs = Math.max(1, Number(option('jobs', 2)));
    await fs.mkdir(path.join(out, 'prompts'), { recursive: true });
    const ratingsFile = path.join(out, 'ratings.jsonl');
    const done = new Set((await fs.readFile(ratingsFile, 'utf8').catch(() => '')).split('\n').filter(Boolean).map((line) => JSON.parse(line)).filter((row) => !row.error).map((row) => row.id));
    const work = [];
    for (const entry of manifest.seeds) {
        const control = chatRows(await fs.readFile(path.join(entry.control.dir, 'rows.jsonl'), 'utf8'), entry.control.arm);
        const candidate = chatRows(await fs.readFile(path.join(entry.candidate.dir, 'rows.jsonl'), 'utf8'), entry.candidate.arm);
        for (const [index, item] of corpus.items.entries()) {
            if (item.kind !== 'chat' || !control.has(index) || !candidate.has(index)) continue;
            const id = pairId(entry.seed, index);
            if (!done.has(id)) work.push({ id, seed: entry.seed, index, item, a: control.get(index).text ?? '', b: candidate.get(index).text ?? '' });
        }
    }
    console.log(`${work.length} pairs to rate (${done.size} already rated), ${jobs} at a time, model ${model}`);
    const next = async () => {
        while (work.length) {
            const pair = work.shift();
            const m = material(pair.item.body.prompt);
            const a = split(pair.a); const b = split(pair.b);
            const flip = flipFor(manifest.label, pair.seed, pair.index);
            const [x, y] = flip ? [b, a] : [a, b];
            const promptFile = path.join(out, 'prompts', `${pair.id}.md`);
            await fs.writeFile(promptFile, ratingPrompt(m, x, y));
            let verdict = null;
            for (let attempt = 0; attempt < 3 && !verdict; attempt += 1) {
                try {
                    const answer = path.resolve(out, 'prompts', `${pair.id}.answer.txt`);
                    await codex(`${await fs.readFile(promptFile, 'utf8')}\n\nAnswer only the JSON.`, answer, path.resolve(out), model);
                    const text = await fs.readFile(answer, 'utf8');
                    const parsed = JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1));
                    if (validVerdict(parsed)) verdict = parsed;
                    else throw new Error('verdict missing keys');
                } catch (error) { console.error(`${pair.id} attempt ${attempt + 1}: ${error.message.slice(0, 200)}`); }
            }
            const row = verdict ? (() => { const blind = unblind(verdict, flip); return { id: pair.id, seed: pair.seed, index: pair.index, speaker: m.speaker, flip, identical: pair.a === pair.b,
                control: { ...blind.control, closed: a.closed }, candidate: { ...blind.candidate, closed: b.closed }, prefer: blind.prefer, why: verdict.why }; })()
                : { id: pair.id, seed: pair.seed, index: pair.index, error: 'no verdict' };
            await fs.appendFile(ratingsFile, `${JSON.stringify(row)}\n`);
            console.log(`${pair.id} ${row.error ?? `prefer=${row.prefer}`}`);
        }
    };
    await Promise.all(Array.from({ length: jobs }, next));
}

async function summarizeRun() {
    const manifestFile = rest[0];
    const out = option('out');
    if (!manifestFile || !out) throw new Error(USAGE);
    const manifest = await readJson(manifestFile);
    const latest = new Map();
    for (const line of (await fs.readFile(path.join(out, 'ratings.jsonl'), 'utf8')).split('\n').filter(Boolean)) {
        const row = JSON.parse(line);
        if (!row.error || !latest.has(row.id)) latest.set(row.id, row);
    }
    const summary = aggregate([...latest.values()], { label: manifest.label, seeds: manifest.seeds.map((entry) => entry.seed) });
    summary.manifest = { controlArm: manifest.controlArm, candidateArm: manifest.candidateArm, seeds: manifest.seeds.map((entry) => ({ seed: entry.seed, control: entry.control.dir, candidate: entry.candidate.dir })) };
    await fs.writeFile(path.join(out, 'summary.json'), JSON.stringify(summary, null, 2));
    console.log(JSON.stringify(summary, null, 2));
}

const commands = { manifest: buildManifest, rate, aggregate: summarizeRun };
if (!commands[command]) { console.error(USAGE); process.exit(2); }
await commands[command]();
