import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const PLUGIN_VERSION = '1.5.0';
export const SECRET_KEY = 'typesafe_api_key';
export const LLAMA_SECRET_KEY = 'so_judge_llama_key';
export const PROVIDERS = Object.freeze({
    typesafe: Object.freeze({ id: 'typesafe', contract: 'native', secretKey: SECRET_KEY, envKey: 'TYPESAFE_API_KEY', dotenv: true, keyRequired: true }),
    'llama-logprob': Object.freeze({ id: 'llama-logprob', contract: 'logprob', secretKey: LLAMA_SECRET_KEY, envKey: 'SO_JUDGE_LLAMA_KEY', dotenv: false, keyRequired: false, urlEnv: 'SO_JUDGE_LLAMA_URL' }),
});
export const LLAMA_LIMITS = Object.freeze({ maxPredict: 4, maxProbs: 50, maxPromptChars: 140_000 });
export const DEFAULT_MODEL = 'jev-1.13.0';
export const MAX_CHOICE_OPTIONS = 255;
// Mirrors src/judge/types.ts: TypeSafe documents 32,000 tokens for state + the longest question and 64,000 for the
// whole request; both minus 10%, estimated at the lowest measured natural-language ratio. Past either
// the API refuses; this refuses first, with 413, and never truncates.
export const TOKEN_LIMIT = 32_000;
export const TOTAL_TOKEN_LIMIT = 64_000;
export const TOKEN_MARGIN = 0.1;
export const MAX_ESTIMATED_TOKENS = Math.floor(TOKEN_LIMIT * (1 - TOKEN_MARGIN));
export const MAX_ESTIMATED_TOTAL_TOKENS = Math.floor(TOTAL_TOKEN_LIMIT * (1 - TOKEN_MARGIN));
export const CHARS_PER_TOKEN = 3.488;
export const MAX_REQUEST_CHARS = Math.floor(MAX_ESTIMATED_TOTAL_TOKENS * CHARS_PER_TOKEN);
export const UPSTREAM_TIMEOUT_MS = 10_000;
export const PERMITTED_MODELS = Object.freeze(['jev-1.13.0', 'jev-latest', 'jev-preview']);
export const MAX_BODY_BYTES = MAX_REQUEST_CHARS * 4;
export const MAX_IN_FLIGHT_PER_USER = 2;
export const MAX_QUEUED_PER_USER = 16;
export const QUEUE_WAIT_MS = 2_000;
export const ACCOUNT_RATE_PER_MIN = 1_200;
export const ACCOUNT_TOKENS_PER_SECOND = 250_000;
export const EXPECTED_USERS = 5;
export const USER_BURST = 2;
export const userShare = (account) => Math.max(1, Math.floor((account * USER_BURST) / EXPECTED_USERS));
export const MAX_CALLS_PER_MINUTE_PER_USER = userShare(ACCOUNT_RATE_PER_MIN);
export const MAX_TOKENS_PER_SECOND_PER_USER = userShare(ACCOUNT_TOKENS_PER_SECOND);
export const RATE_ENV = 'SO_JUDGE_RATE_PER_MIN';
export const ACCOUNT_RATE_ENV = 'SO_JUDGE_ACCOUNT_RATE_PER_MIN';
export const ACCOUNT_TOKENS_ENV = 'SO_JUDGE_ACCOUNT_TOKENS_PER_SEC';
export const IN_FLIGHT_ENV = 'SO_JUDGE_MAX_IN_FLIGHT';
export const BACKOFF_FACTOR = 0.5;
export const BACKOFF_FLOOR = 0.1;
export const RECOVER_HOLD_MS = 30_000;
export const RECOVER_MS = 120_000;
export const MAX_COOL_MS = 300_000;
export const PLUGIN_HEADER = 'x-so-plugin';
const RETRY_STATUSES = new Set([429, 529]);
const RETRY_DELAY_MS = 600;
const DOTENV_FILE = path.join(os.homedir(), '.typesafe', 'api-key', '.env');

export const info = {
    id: 'story-orchestrator-judge',
    name: 'Story Orchestrator judge',
    description: 'Server-side proxy from Story Orchestrator to its judge providers (TypeSafe System One, llama-server log-probabilities); keys never reach the page.',
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

let utilModule;

async function loadUtil() {
    if (utilModule !== undefined) return utilModule;
    try {
        const here = path.dirname(fileURLToPath(import.meta.url));
        utilModule = await import(pathToFileURL(path.resolve(here, '..', '..', 'src', 'util.js')).href);
    } catch {
        utilModule = null;
    }
    return utilModule;
}

let accountsWarned = false;
const warnAccounts = (line) => {
    if (accountsWarned) return;
    accountsWarned = true;
    console.warn(`[story-orchestrator-judge] ${line}`);
};

export async function userAccountsEnabled({ load = loadUtil, log = warnAccounts } = {}) {
    const util = await load();
    if (typeof util?.getConfigValue !== 'function') {
        log('could not read enableUserAccounts from SillyTavern (src/util.js); treating user accounts as on, so keys come only from each user\'s own ST secrets');
        return true;
    }
    try {
        return util.getConfigValue('enableUserAccounts', false, 'boolean') === true;
    } catch (error) {
        log(`enableUserAccounts could not be read (${error?.message ?? 'error'}); treating user accounts as on, so keys come only from each user's own ST secrets`);
        return true;
    }
}

export async function resolveKey(request, providerId = 'typesafe', options = {}) {
    const provider = PROVIDERS[providerId];
    if (!provider) return null;
    const secrets = await loadSecrets();
    if (typeof secrets?.readSecret === 'function' && request?.user?.directories) {
        try {
            const value = secrets.readSecret(request.user.directories, provider.secretKey);
            if (typeof value === 'string' && value.trim()) return { key: value.trim(), source: 'st-secrets' };
        } catch {
            // fall through to the next source
        }
    }
    const accounts = typeof options.accountsEnabled === 'boolean' ? options.accountsEnabled : await userAccountsEnabled();
    if (accounts) return null;
    const fromEnv = process.env[provider.envKey]?.trim();
    if (fromEnv) return { key: fromEnv, source: 'env' };
    const fromDotenv = provider.dotenv ? keyFromDotenv() : '';
    if (fromDotenv) return { key: fromDotenv, source: 'dotenv' };
    return null;
}

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', '::1']);

export function llamaEndpoint(env = process.env) {
    const raw = env[PROVIDERS['llama-logprob'].urlEnv]?.trim();
    if (!raw) return null;
    try {
        const url = new URL(raw);
        if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
        return { base: url.href.replace(/\/$/, ''), host: url.host, local: LOOPBACK_HOSTS.has(url.hostname) };
    } catch {
        return null;
    }
}

export function validateLlamaBody(body) {
    if (!isRecord(body)) return { issues: ['body must be a JSON object'] };
    const issues = [];
    if (typeof body.prompt !== 'string' || !body.prompt.trim()) issues.push('prompt must be a non-empty string');
    else if (body.prompt.length > LLAMA_LIMITS.maxPromptChars) issues.push(`prompt is over ${LLAMA_LIMITS.maxPromptChars} chars`);
    if (!Number.isInteger(body.n_predict) || body.n_predict < 1 || body.n_predict > LLAMA_LIMITS.maxPredict) issues.push(`n_predict must be 1-${LLAMA_LIMITS.maxPredict}`);
    if (!Number.isInteger(body.n_probs) || body.n_probs < 1 || body.n_probs > LLAMA_LIMITS.maxProbs) issues.push(`n_probs must be 1-${LLAMA_LIMITS.maxProbs}`);
    if (typeof body.temperature !== 'number' || body.temperature < 0 || body.temperature > 2) issues.push('temperature must be 0-2');
    if (issues.length) return { issues };
    return {
        issues,
        payload: {
            prompt: body.prompt,
            n_predict: body.n_predict,
            n_probs: body.n_probs,
            temperature: body.temperature,
            cache_prompt: body.cache_prompt === true,
            post_sampling_probs: body.post_sampling_probs === true,
            stream: false,
        },
    };
}

const isRecord = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);

export function estimateTokens(body) {
    const questions = isRecord(body?.questions) ? Object.values(body.questions) : [];
    const longest = Math.max(0, ...questions.map((question) => JSON.stringify(question).length));
    return Math.ceil((JSON.stringify(body?.state ?? {}).length + longest) / CHARS_PER_TOKEN);
}

export function estimateTotalTokens(body) {
    return Math.ceil(JSON.stringify({ state: body?.state ?? {}, questions: body?.questions ?? {} }).length / CHARS_PER_TOKEN);
}

export const estimateInputTokens = (body) => Math.ceil((JSON.stringify(body ?? {}) ?? '').length / CHARS_PER_TOKEN);

export function sizeIssues(body) {
    if (!isRecord(body)) return [];
    const issues = [];
    const tokens = estimateTokens(body);
    if (tokens > MAX_ESTIMATED_TOKENS) issues.push(`request is over ${MAX_ESTIMATED_TOKENS} estimated tokens (${tokens})`);
    const total = estimateTotalTokens(body);
    if (total > MAX_ESTIMATED_TOTAL_TOKENS) issues.push(`request is over ${MAX_ESTIMATED_TOTAL_TOKENS} estimated tokens in total (${total})`);
    return issues;
}

export function validateRequest(body) {
    return [...shapeIssues(body), ...sizeIssues(body)];
}

export function shapeIssues(body) {
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
    return issues;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export function parseRetryAfter(value, at = Date.now()) {
    if (typeof value !== 'string' || !value.trim()) return null;
    const raw = value.trim();
    if (/^\d+$/.test(raw)) return Math.min(MAX_COOL_MS, Number(raw) * 1000);
    const date = /[a-z]/i.test(raw) ? Date.parse(raw) : NaN;
    if (!Number.isFinite(date)) return null;
    return Math.min(MAX_COOL_MS, Math.max(0, date - at));
}

export function createAdaptiveRate({ now = Date.now, factor: backoff = BACKOFF_FACTOR, floor = BACKOFF_FLOOR, holdMs = RECOVER_HOLD_MS, recoverMs = RECOVER_MS } = {}) {
    let base = 1;
    let since = -Infinity;
    let coolUntil = 0;
    let busyAnswers = 0;
    const factor = () => Math.min(1, base + Math.max(0, now() - since - holdMs) / recoverMs);
    const coolingMs = () => Math.max(0, coolUntil - now());
    return {
        factor,
        coolingMs,
        busy(retryAfterMs = null) {
            base = Math.max(floor, factor() * backoff);
            since = now();
            busyAnswers += 1;
            if (Number.isFinite(retryAfterMs) && retryAfterMs > 0) coolUntil = Math.max(coolUntil, now() + retryAfterMs);
        },
        state: () => ({ factor: Math.round(factor() * 1000) / 1000, coolingMs: coolingMs(), busyAnswers }),
    };
}

async function callUpstream(key, payload, fetchImpl, url = apiUrl(), { onBusy = () => undefined, now = Date.now } = {}) {
    let last = null;
    for (let attempt = 0; attempt < 2; attempt += 1) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);
        try {
            const response = await fetchImpl(url, {
                method: 'POST',
                headers: key ? { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` } : { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
                signal: controller.signal,
            });
            const text = await response.text();
            const retryAfter = response.headers?.get?.('retry-after') ?? null;
            const busy = RETRY_STATUSES.has(response.status);
            const busyAnswers = (last?.busyAnswers ?? 0) + (busy ? 1 : 0);
            last = { status: response.status, text, busyAnswers, retried: attempt > 0, ...(retryAfter ? { retryAfter } : {}) };
            if (!busy) return last;
            const waitMs = parseRetryAfter(retryAfter, now());
            onBusy(waitMs);
            if (waitMs !== null && waitMs > RETRY_DELAY_MS) return last;
        } catch (error) {
            if (error?.name === 'AbortError') return { status: 504, text: JSON.stringify({ error: 'upstream timeout' }) };
            last = { status: 502, text: JSON.stringify({ error: 'upstream unreachable' }) };
        } finally {
            clearTimeout(timer);
        }
        if (attempt === 0) await sleep(RETRY_DELAY_MS);
    }
    return last;
}

const refusal = (status, error) => ({ status, error });
const header = (request, name) => {
    const value = request?.headers?.[name];
    return typeof value === 'string' && value.length ? value : null;
};

export function guardRequest(request) {
    if (header(request, PLUGIN_HEADER) !== '1') return refusal(403, `missing ${PLUGIN_HEADER} header`);
    const site = header(request, 'sec-fetch-site');
    if (site && site !== 'same-origin') return refusal(403, `cross-origin call (sec-fetch-site: ${site})`);
    const origin = header(request, 'origin');
    if (origin) {
        let originHost = null;
        try { originHost = new URL(origin).host; } catch { originHost = null; }
        if (originHost !== header(request, 'host')) return refusal(403, 'foreign origin');
    }
    return null;
}

export async function readTextBody(request, limit = MAX_BODY_BYTES) {
    if (isRecord(request?.body) && Object.keys(request.body).length) return refusal(415, 'send the request as text/plain');
    if (!/^text\/plain\b/i.test(header(request, 'content-type') ?? '')) return refusal(415, 'send the request as text/plain');
    const chunks = [];
    let size = 0;
    try {
        for await (const chunk of request) {
            size += chunk.length;
            if (size > limit) return refusal(413, `request body is over ${limit} bytes`);
            chunks.push(chunk);
        }
    } catch {
        return refusal(400, 'the request body could not be read');
    }
    try {
        return { body: JSON.parse(Buffer.concat(chunks).toString('utf8')) };
    } catch {
        return refusal(400, 'request body is not JSON');
    }
}

const positiveInteger = (raw, fallback) => (typeof raw === 'string' && /^\d+$/.test(raw.trim()) && Number(raw) >= 1 ? Number(raw) : fallback);

export function limitsFromEnv(env = process.env) {
    const accountPerMinute = positiveInteger(env?.[ACCOUNT_RATE_ENV], ACCOUNT_RATE_PER_MIN);
    const accountTokensPerSecond = positiveInteger(env?.[ACCOUNT_TOKENS_ENV], ACCOUNT_TOKENS_PER_SECOND);
    return {
        maxInFlight: positiveInteger(env?.[IN_FLIGHT_ENV], MAX_IN_FLIGHT_PER_USER),
        perMinute: positiveInteger(env?.[RATE_ENV], userShare(accountPerMinute)),
        accountPerMinute,
        tokensPerSecond: userShare(accountTokensPerSecond),
        accountTokensPerSecond,
    };
}

const WINDOW_MS = 60_000;
const TOKEN_WINDOW_MS = 1_000;

const callWait = (stamps, limit, at) => (stamps.length >= limit ? stamps[stamps.length - limit] + WINDOW_MS - at : 0);

const tokenWait = (spent, limit, cost, at) => {
    let used = spent.reduce((sum, entry) => sum + entry.cost, 0);
    if (!spent.length || used + cost <= limit) return 0;
    for (const entry of spent) {
        used -= entry.cost;
        if (used + cost <= limit) return entry.at + TOKEN_WINDOW_MS - at;
    }
    return spent[spent.length - 1].at + TOKEN_WINDOW_MS - at;
};

const prune = (bucket, at) => {
    bucket.stamps = bucket.stamps.filter((stamp) => at - stamp < WINDOW_MS);
    bucket.spent = bucket.spent.filter((entry) => at - entry.at < TOKEN_WINDOW_MS);
};

export function createLimiter({
    maxInFlight = MAX_IN_FLIGHT_PER_USER, perMinute = MAX_CALLS_PER_MINUTE_PER_USER, accountPerMinute = ACCOUNT_RATE_PER_MIN,
    tokensPerSecond = MAX_TOKENS_PER_SECOND_PER_USER, accountTokensPerSecond = ACCOUNT_TOKENS_PER_SECOND,
    maxQueued = MAX_QUEUED_PER_USER, queueWaitMs = QUEUE_WAIT_MS, now = Date.now, onRefuse = () => undefined, adaptive = createAdaptiveRate({ now }),
} = {}) {
    const users = new Map();
    const account = { stamps: [], spent: [] };
    const take = (user, cost) => {
        const at = now();
        const cooling = adaptive.coolingMs();
        if (cooling > 0) {
            onRefuse(Math.max(1, Math.ceil(cooling / 1000)));
            return null;
        }
        const factor = adaptive.factor();
        const scaled = (limit) => Math.max(1, Math.floor(limit * factor));
        prune(user, at);
        prune(account, at);
        const wait = Math.max(
            callWait(user.stamps, scaled(perMinute), at), callWait(account.stamps, scaled(accountPerMinute), at),
            tokenWait(user.spent, scaled(tokensPerSecond), cost, at), tokenWait(account.spent, scaled(accountTokensPerSecond), cost, at),
        );
        if (wait > 0) {
            onRefuse(Math.max(1, Math.ceil(wait / 1000)));
            return null;
        }
        user.inFlight += 1;
        for (const bucket of [user, account]) {
            bucket.stamps.push(at);
            bucket.spent.push({ at, cost });
        }
        let released = false;
        return () => {
            if (released) return;
            released = true;
            user.inFlight -= 1;
            user.waiting.shift()?.();
        };
    };
    return async (handle, cost = 0) => {
        const user = users.get(handle) ?? { inFlight: 0, stamps: [], spent: [], waiting: [] };
        users.set(handle, user);
        if (user.inFlight < maxInFlight && !user.waiting.length) return take(user, cost);
        if (user.waiting.length >= maxQueued) {
            onRefuse(1);
            return null;
        }
        const slot = await new Promise((resolve) => {
            const wake = () => { clearTimeout(timer); resolve(true); };
            const timer = setTimeout(() => {
                const index = user.waiting.indexOf(wake);
                if (index >= 0) user.waiting.splice(index, 1);
                resolve(false);
            }, queueWaitMs);
            user.waiting.push(wake);
        });
        if (!slot) {
            onRefuse(1);
            return null;
        }
        const release = take(user, cost);
        if (!release) user.waiting.shift()?.();
        return release;
    };
}

const sendUpstream = (response, upstream) => {
    if (upstream.retryAfter) response.set?.('Retry-After', upstream.retryAfter);
    response.status(upstream.status).type('application/json').send(upstream.text);
};

export function createHandlers({ fetchImpl = globalThis.fetch, now = Date.now, accountsEnabled, env = process.env, log = (line) => console.warn(`[story-orchestrator-judge] ${line}`) } = {}) {
    const limits = limitsFromEnv(env);
    let retryAfter = 1;
    const refusals = { since: new Date(now()).toISOString(), local: 0, upstreamBusyAnswers: 0, upstreamRefused: 0, lastUpstream: null };
    const adaptive = { typesafe: createAdaptiveRate({ now }), 'llama-logprob': createAdaptiveRate({ now }) };
    const onRefuse = (seconds) => { retryAfter = seconds; };
    const acquire = {
        typesafe: createLimiter({ ...limits, now, onRefuse, adaptive: adaptive.typesafe }),
        'llama-logprob': createLimiter({ ...limits, now, onRefuse, adaptive: adaptive['llama-logprob'] }),
    };
    const upstreamOptions = (provider) => ({ now, onBusy: (waitMs) => adaptive[provider].busy(waitMs) });
    const countUpstream = (provider, upstream) => {
        refusals.upstreamBusyAnswers += upstream?.busyAnswers ?? 0;
        if (!RETRY_STATUSES.has(upstream?.status)) return;
        refusals.upstreamRefused += 1;
        refusals.lastUpstream = { at: new Date(now()).toISOString(), provider, status: upstream.status, retryAfter: upstream.retryAfter ?? null };
        const percent = Math.round(adaptive[provider].factor() * 100);
        log(`${provider} answered ${upstream.status} ${upstream.retried ? 'after one retry' : 'and was not retried'} (Retry-After ${upstream.retryAfter ?? 'none'}); passed to the page; rate held at ${percent}% of the limit`);
    };
    const keyOptions = typeof accountsEnabled === 'boolean' ? { accountsEnabled } : {};
    const guarded = async (request, response, run, provider) => {
        const blocked = guardRequest(request);
        if (blocked) return response.status(blocked.status).json({ error: blocked.error });
        const read = await readTextBody(request);
        if (read.error) return response.status(read.status).json({ error: read.error });
        const release = await acquire[provider](request?.user?.profile?.handle ?? 'default-user', estimateInputTokens(read.body));
        if (!release) {
            refusals.local += 1;
            response.set?.('Retry-After', String(retryAfter));
            return response.status(429).json({ error: 'too many judge calls for this user; retry shortly', retryAfterSeconds: retryAfter });
        }
        try {
            return await run({ ...request, headers: request.headers, user: request.user, body: read.body }, response);
        } finally {
            release();
        }
    };
    const handlers = {
        async status(request, response) {
            const resolved = await resolveKey(request, 'typesafe', keyOptions);
            const llama = llamaEndpoint(env);
            const llamaKey = llama ? await resolveKey(request, 'llama-logprob', keyOptions) : null;
            return response.json({
                configured: Boolean(resolved), keySource: resolved?.source ?? null, model: DEFAULT_MODEL, pluginVersion: PLUGIN_VERSION,
                limits,
                adaptive: { typesafe: adaptive.typesafe.state(), 'llama-logprob': adaptive['llama-logprob'].state() },
                refusals: { ...refusals },
                providers: {
                    typesafe: { configured: Boolean(resolved), keySource: resolved?.source ?? null, contract: PROVIDERS.typesafe.contract, local: false, host: new URL(apiUrl()).host },
                    'llama-logprob': { configured: Boolean(llama), keySource: llamaKey?.source ?? null, contract: PROVIDERS['llama-logprob'].contract, local: llama?.local ?? false, host: llama?.host ?? null },
                },
            });
        },
        async llamaCompletion(request, response) {
            const endpoint = llamaEndpoint(env);
            if (!endpoint) return response.status(409).json({ configured: false, error: `no llama-server configured (set ${PROVIDERS['llama-logprob'].urlEnv} on the SillyTavern server)` });
            const { issues, payload } = validateLlamaBody(request.body);
            if (issues.length) return response.status(400).json({ error: 'invalid request', issues });
            const resolved = await resolveKey(request, 'llama-logprob', keyOptions);
            const upstream = await callUpstream(resolved?.key ?? null, payload, fetchImpl, `${endpoint.base}/completion`, upstreamOptions('llama-logprob'));
            countUpstream('llama-logprob', upstream);
            sendUpstream(response, upstream);
        },
        async systemone(request, response) {
            const issues = shapeIssues(request.body);
            if (issues.length) return response.status(400).json({ error: 'invalid request', issues });
            const oversize = sizeIssues(request.body);
            if (oversize.length) return response.status(413).json({ error: 'request too large', tooLarge: true, issues: oversize });
            const resolved = await resolveKey(request, 'typesafe', keyOptions);
            if (!resolved) return response.status(409).json({ configured: false, error: 'no TypeSafe API key configured' });
            const model = typeof request.body.model === 'string' && request.body.model.trim() ? request.body.model.trim() : DEFAULT_MODEL;
            if (!PERMITTED_MODELS.includes(model)) return response.status(400).json({ error: `model not permitted: ${model}`, permitted: PERMITTED_MODELS });
            const payload = { state: request.body.state, questions: request.body.questions, model };
            const upstream = await callUpstream(resolved.key, payload, fetchImpl, apiUrl(), upstreamOptions('typesafe'));
            countUpstream('typesafe', upstream);
            sendUpstream(response, upstream);
        },
        receive(request, response) {
            return guarded(request, response, handlers.systemone, 'typesafe');
        },
        receiveLlama(request, response) {
            return guarded(request, response, handlers.llamaCompletion, 'llama-logprob');
        },
    };
    return handlers;
}

export function guardRoute(handler, log = (line) => console.error(`[story-orchestrator-judge] ${line}`)) {
    return (request, response) => {
        let pending;
        try {
            pending = Promise.resolve(handler(request, response));
        } catch (error) {
            pending = Promise.reject(error);
        }
        return pending.catch((error) => {
            log(`a route failed: ${error?.message ?? String(error)}`);
            if (response.headersSent) return;
            try {
                response.status(500).json({ error: 'the judge plugin failed on this request' });
            } catch {
                return;
            }
        });
    };
}

export async function init(router) {
    const handlers = createHandlers();
    router.get('/status', guardRoute(handlers.status));
    router.post('/systemone', guardRoute(handlers.receive));
    router.post('/providers/llama-logprob/completion', guardRoute(handlers.receiveLlama));
    const resolved = await resolveKey(null);
    const limits = limitsFromEnv();
    console.log(`[story-orchestrator-judge] loaded; key from ${resolved?.source ?? 'ST secrets (per user) or not configured'}; per user ${limits.perMinute}/min, ${limits.maxInFlight} in flight (${RATE_ENV}, ${IN_FLIGHT_ENV}); account ${limits.accountPerMinute}/min, ${limits.accountTokensPerSecond} input tokens/s (${ACCOUNT_RATE_ENV}, ${ACCOUNT_TOKENS_ENV}), per user ${limits.tokensPerSecond} tokens/s; lowered on a TypeSafe 429`);
}

export async function exit() {
    return Promise.resolve();
}

export default { info, init, exit };
