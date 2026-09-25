import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const PLUGIN_VERSION = '1.0.0';
export const SECRET_KEY = 'typesafe_api_key';
export const DEFAULT_MODEL = 'jev-1.13.0';
export const MAX_CHOICE_OPTIONS = 255;
export const MAX_REQUEST_CHARS = 140_000;
// Mirrors src/judge/types.ts (v2.4 plan 07 T25): the documented 32k state + longest-question limit minus 10%,
// estimated at the lowest measured natural-language ratio. Past it the API refuses; this refuses first.
export const MAX_ESTIMATED_TOKENS = Math.floor(32_768 * 0.9);
export const CHARS_PER_TOKEN = 3.488;
export const UPSTREAM_TIMEOUT_MS = 10_000;
const RETRY_STATUSES = new Set([429, 529]);
const RETRY_DELAY_MS = 600;
const DOTENV_FILE = path.join(os.homedir(), '.typesafe', 'api-key', '.env');

export const info = {
    id: 'story-orchestrator-judge',
    name: 'Story Orchestrator judge',
    description: 'Server-side proxy from Story Orchestrator to the TypeSafe System One API; the API key never reaches the page.',
};

const apiUrl = () => `${(process.env.TYPESAFE_BASE_URL ?? 'https://api.typesafe.ai').replace(/\/$/, '')}/v1/systemone`;

let secretsModule;

// ST's own secrets store (src/endpoints/secrets.js). Resolved relative to the installed plugin
// (<ST root>/plugins/<dir>/), and optional: if a future ST moves the file, env and .env still work.
async function loadSecrets() {
    if (secretsModule !== undefined) return secretsModule;
    try {
        const here = path.dirname(fileURLToPath(import.meta.url));
        secretsModule = await import(pathToFileURL(path.resolve(here, '..', '..', 'src', 'endpoints', 'secrets.js')).href);
    } catch {
        secretsModule = null;
    }
    return secretsModule;
}

function keyFromDotenv(file = DOTENV_FILE) {
    try {
        if (!fs.existsSync(file)) return '';
        for (const line of fs.readFileSync(file, 'utf-8').split(/\r?\n/)) {
            const match = line.match(/^\s*(?:export\s+)?TYPESAFE_API_KEY\s*=\s*(.*)$/);
            if (match) return match[1].trim().replace(/^(['"])(.*)\1$/, '$2').trim();
        }
    } catch {
        return '';
    }
    return '';
}

export async function resolveKey(request) {
    const secrets = await loadSecrets();
    if (typeof secrets?.readSecret === 'function' && request?.user?.directories) {
        try {
            const value = secrets.readSecret(request.user.directories, SECRET_KEY);
            if (typeof value === 'string' && value.trim()) return { key: value.trim(), source: 'st-secrets' };
        } catch {
            // fall through to the next source
        }
    }
    const fromEnv = process.env.TYPESAFE_API_KEY?.trim();
    if (fromEnv) return { key: fromEnv, source: 'env' };
    const fromDotenv = keyFromDotenv();
    if (fromDotenv) return { key: fromDotenv, source: 'dotenv' };
    return null;
}

const isRecord = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);

export function estimateTokens(body) {
    const questions = isRecord(body?.questions) ? Object.values(body.questions) : [];
    const longest = Math.max(0, ...questions.map((question) => JSON.stringify(question).length));
    return Math.ceil((JSON.stringify(body?.state ?? {}).length + longest) / CHARS_PER_TOKEN);
}

export function validateRequest(body) {
    const issues = [];
    if (!isRecord(body)) return ['body must be a JSON object'];
    if (!isRecord(body.state)) issues.push('state must be an object');
    if (!isRecord(body.questions) || !Object.keys(body.questions).length) return [...issues, 'questions must be a non-empty object'];
    for (const [id, question] of Object.entries(body.questions)) {
        if (!isRecord(question) || typeof question.instructions !== 'string' || !question.instructions.trim()) {
            issues.push(`${id}: missing instructions`);
            continue;
        }
        if (question.type === 'choice') {
            const count = isRecord(question.criteria) ? Object.keys(question.criteria).length : 0;
            if (count < 2 || count > MAX_CHOICE_OPTIONS) issues.push(`${id}: choice needs 2-${MAX_CHOICE_OPTIONS} options (has ${count})`);
        } else if (question.type === 'score') {
            const count = Array.isArray(question.criteria) ? question.criteria.length : 0;
            if (count < 2 || count > 10) issues.push(`${id}: score needs 2-10 levels (has ${count})`);
        } else if (question.type === 'noul') {
            if (question.criteria !== undefined) {
                const extra = isRecord(question.criteria) ? Object.keys(question.criteria).filter((key) => key !== 'true' && key !== 'false') : ['(not an object)'];
                if (extra.length) issues.push(`${id}: noul criteria only takes true/false (got ${extra.join(', ')})`);
            }
        } else {
            issues.push(`${id}: unknown type`);
        }
    }
    if (JSON.stringify(body).length > MAX_REQUEST_CHARS) issues.push(`request is over ${MAX_REQUEST_CHARS} chars`);
    const tokens = estimateTokens(body);
    if (tokens > MAX_ESTIMATED_TOKENS) issues.push(`request is over ${MAX_ESTIMATED_TOKENS} estimated tokens (${tokens})`);
    return issues;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function callUpstream(key, payload, fetchImpl) {
    let last = null;
    for (let attempt = 0; attempt < 2; attempt += 1) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);
        try {
            const response = await fetchImpl(apiUrl(), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
                body: JSON.stringify(payload),
                signal: controller.signal,
            });
            const text = await response.text();
            last = { status: response.status, text };
            if (!RETRY_STATUSES.has(response.status)) return last;
        } catch (error) {
            if (error?.name === 'AbortError') return { status: 504, text: JSON.stringify({ error: 'upstream timeout' }) };
            last = { status: 502, text: JSON.stringify({ error: 'upstream unreachable' }) };
        } finally {
            clearTimeout(timer);
        }
        await sleep(RETRY_DELAY_MS);
    }
    return last;
}

export function createHandlers({ fetchImpl = globalThis.fetch } = {}) {
    return {
        async status(request, response) {
            const resolved = await resolveKey(request);
            return response.json({ configured: Boolean(resolved), keySource: resolved?.source ?? null, model: DEFAULT_MODEL, pluginVersion: PLUGIN_VERSION });
        },
        async systemone(request, response) {
            const issues = validateRequest(request.body);
            if (issues.length) return response.status(400).json({ error: 'invalid request', issues });
            const resolved = await resolveKey(request);
            if (!resolved) return response.status(409).json({ configured: false, error: 'no TypeSafe API key configured' });
            const payload = { state: request.body.state, questions: request.body.questions, model: typeof request.body.model === 'string' && request.body.model.trim() ? request.body.model.trim() : DEFAULT_MODEL };
            const upstream = await callUpstream(resolved.key, payload, fetchImpl);
            response.status(upstream.status).type('application/json').send(upstream.text);
        },
    };
}

export async function init(router) {
    const handlers = createHandlers();
    router.get('/status', (request, response) => { void handlers.status(request, response); });
    router.post('/systemone', (request, response) => { void handlers.systemone(request, response); });
    const resolved = await resolveKey(null);
    console.log(`[story-orchestrator-judge] loaded; key from ${resolved?.source ?? 'ST secrets (per user) or not configured'}`);
}

export async function exit() {
    return Promise.resolve();
}

export default { info, init, exit };
