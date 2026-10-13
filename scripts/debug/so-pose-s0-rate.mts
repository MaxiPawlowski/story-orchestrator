import { spawn } from 'node:child_process';
import { appendFileSync, existsSync, readFileSync } from 'node:fs';

const [jobsFile, resultsFile] = process.argv.slice(2);
if (!jobsFile || !resultsFile) throw new Error('usage: so-pose-s0-rate.mts <jobs.jsonl> <results.jsonl> [--limit n]');
const MODEL = 'openai/gpt-6.1-sol';
const CONCURRENCY = Number(process.env.SO_RATE_CONCURRENCY ?? 3);
const limit = Number(process.argv[process.argv.indexOf('--limit') + 1] || Infinity);
const jobs: { key: string; path: string; prompt: string }[] = readFileSync(jobsFile, 'utf8').split('\n').filter(Boolean).map((line) => JSON.parse(line));
const done = new Set(existsSync(resultsFile) ? readFileSync(resultsFile, 'utf8').split('\n').filter(Boolean).map((line) => JSON.parse(line)).filter((row) => row.rating).map((row) => row.key) : []);

export const extractJson = (text: string): unknown => {
    const start = text.indexOf('{'), end = text.lastIndexOf('}');
    if (start < 0 || end < start) return null;
    try { return JSON.parse(text.slice(start, end + 1)); } catch { return null; }
};

const callOnce = (job: { path: string; prompt: string }) => new Promise<string>((resolve) => {
    const child = spawn('opencode', ['run', '-m', MODEL, '-f', job.path, job.prompt], { shell: false, windowsHide: true });
    let stdout = '';
    child.stdin.end();
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', () => {});
    const timer = setTimeout(() => child.kill(), 300000);
    child.on('close', () => { clearTimeout(timer); resolve(stdout); });
    child.on('error', () => { clearTimeout(timer); resolve(stdout); });
});

let calls = 0;
const rate = async (job: { key: string; path: string; prompt: string }) => {
    for (let attempt = 1; attempt <= 2; attempt += 1) {
        calls += 1;
        const text = await callOnce(job);
        const rating = extractJson(text);
        if (rating) { appendFileSync(resultsFile, JSON.stringify({ key: job.key, rating, attempt }) + '\n'); return true; }
    }
    appendFileSync(resultsFile, JSON.stringify({ key: job.key, failed: true }) + '\n');
    return false;
};

const queue = jobs.filter((job) => !done.has(job.key)).slice(0, limit);
console.log(`${queue.length} jobs to rate, ${done.size} already done`);
await Promise.all(Array.from({ length: CONCURRENCY }, async () => {
    while (queue.length) { const job = queue.shift(); if (job) await rate(job); }
}));
console.log(`opencode calls: ${calls}`);
appendFileSync(resultsFile, JSON.stringify({ calls, at: new Date().toISOString() }) + '\n');
