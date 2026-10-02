import { execFile, spawn } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { BRIDGE_HARNESSES, createAgentBridge, validateOpen } from './agentBridge.mjs';

export const PLUGIN_VERSION = '1.2.0';
export const HARNESS_IDS = Object.freeze(['claude', 'codex', 'opencode']);
export const PLUGIN_HEADER = 'x-so-plugin';
export const LIMITS = Object.freeze({
    maxBodyBytes: 2_000_000,
    maxPromptChars: 400_000,
    maxSystemChars: 20_000,
    maxOutputChars: 400_000,
    minTimeoutMs: 1_000,
    maxTimeoutMs: 900_000,
    deadlineMarginMs: 500,
    versionTimeoutMs: 15_000,
    loginMinMinutes: 90,
});
export const EFFORTS = Object.freeze(['low', 'medium', 'high']);
export const QUOTA_HOLD_MS = 600_000;
export const quotaHoldMs = (env = process.env) => {
    const raw = env.SO_HARNESS_QUOTA_HOLD_MS;
    if (raw === undefined || raw === '') return QUOTA_HOLD_MS;
    const value = Number(raw);
    return Number.isInteger(value) && value >= 0 ? value : QUOTA_HOLD_MS;
};
export const PHASE0 = Object.freeze({
    claude: 'not run: the stored login had expired (v2.5 plan 13 run 3)',
    codex: 'not run in owned homes (quota, then a stale login)',
    opencode: 'P0-2, H-N1, H-N1b, P0-3 pass in owned homes; P0-7 5/5 re-run on the pre-warmed cache owed (B2)',
});
export const DEFAULT_MODELS = Object.freeze({
    claude: Object.freeze([{ id: 'haiku', context: 200_000 }, { id: 'sonnet', context: 200_000 }, { id: 'opus', context: 200_000 }]),
    codex: Object.freeze([{ id: 'default', context: 200_000 }]),
    opencode: Object.freeze([{ id: 'openai/gpt-6-astra-fast', context: 200_000 }, { id: 'openai/gpt-6-astra', context: 200_000 }]),
});
export const CODEX_TOOL_FEATURES = Object.freeze(['shell_tool', 'browser_use', 'computer_use', 'image_generation', 'apps', 'plugins', 'hooks']);
export const OPENCODE_QUIET = Object.freeze({
    OPENCODE_DISABLE_AUTOUPDATE: '1',
    OPENCODE_DISABLE_SHARE: '1',
    OPENCODE_DISABLE_CLAUDE_CODE: '1',
    OPENCODE_DISABLE_PROJECT_CONFIG: '1',
    OPENCODE_DISABLE_EXTERNAL_SKILLS: '1',
    OPENCODE_DISABLE_LSP_DOWNLOAD: '1',
    OPENCODE_DISABLE_MODELS_FETCH: '1',
});
export const BASE_ENV = Object.freeze([
    'PATH', 'Path', 'SystemRoot', 'SYSTEMROOT', 'windir', 'ComSpec', 'PATHEXT', 'ProgramData', 'ProgramFiles', 'ProgramFiles(x86)',
    'NUMBER_OF_PROCESSORS', 'PROCESSOR_ARCHITECTURE', 'OS', 'SystemDrive', 'LANG', 'LC_ALL', 'TZ',
]);
export const PASS_THROUGH_ENV = Object.freeze([
    'HTTPS_PROXY', 'HTTP_PROXY', 'NO_PROXY', 'ALL_PROXY', 'https_proxy', 'http_proxy', 'no_proxy', 'all_proxy',
    'NODE_EXTRA_CA_CERTS', 'SSL_CERT_FILE', 'SSL_CERT_DIR', 'CODEX_CA_CERTIFICATE',
    'DO_NOT_TRACK', 'DISABLE_TELEMETRY', 'DISABLE_ERROR_REPORTING', 'CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC',
]);
export const RM_RETRY = Object.freeze({ recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
const SHIM_EXTENSIONS = new Set(['.cmd', '.bat', '.ps1']);
const ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;
const ROLE_PATTERN = /^[a-z][a-z0-9-]{0,31}$/;
const MODEL_PATTERN = /^[A-Za-z0-9._:/-]{1,80}$/;

export const info = {
    id: 'story-orchestrator-harness',
    name: 'Story Orchestrator harness',
    description: 'Answers Story Orchestrator passes through Claude Code, Codex or opencode on this machine, text in and text out, with tools off. Off until a role is routed to it.',
};

const isRecord = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const here = path.dirname(fileURLToPath(import.meta.url));

const positiveInt = (value, fallback, max) => (Number.isInteger(value) && value > 0 ? Math.min(value, max) : fallback);

const sanitizeModels = (value, fallback) => {
    if (!Array.isArray(value)) return fallback.map((model) => ({ ...model }));
    const models = value.filter((model) => isRecord(model) && typeof model.id === 'string' && MODEL_PATTERN.test(model.id))
        .map((model) => ({ id: model.id, context: positiveInt(model.context, 200_000, 2_000_000) }));
    return models.length ? models : fallback.map((model) => ({ ...model }));
};

export function sanitizeConfig(raw) {
    const source = isRecord(raw) ? raw : {};
    const harnesses = Object.fromEntries(HARNESS_IDS.map((id) => {
        const entry = isRecord(source.harnesses?.[id]) ? source.harnesses[id] : {};
        return [id, {
            binary: typeof entry.binary === 'string' && entry.binary.trim() ? entry.binary.trim() : null,
            loginFile: typeof entry.loginFile === 'string' && entry.loginFile.trim() ? entry.loginFile.trim() : null,
            concurrency: positiveInt(entry.concurrency, 2, 8),
            queueLimit: positiveInt(entry.queueLimit, 8, 64),
            offer: entry.offer === true,
            models: sanitizeModels(entry.models, DEFAULT_MODELS[id]),
        }];
    }));
    return {
        allowNonAdmin: source.allowNonAdmin === true,
        loginMinMinutes: positiveInt(source.loginMinMinutes, LIMITS.loginMinMinutes, 24 * 60),
        tmpRoot: typeof source.tmpRoot === 'string' && source.tmpRoot.trim() ? source.tmpRoot.trim() : path.join(os.tmpdir(), 'so-harness'),
        harnesses,
    };
}

export function loadConfig(file = path.join(here, 'config.json'), readFile = fs.readFileSync, log = (line) => console.warn(`[story-orchestrator-harness] ${line}`)) {
    let text;
    try {
        text = readFile(file, 'utf-8');
    } catch (error) {
        if (error?.code !== 'ENOENT') log(`config.json could not be read (${error?.code ?? error?.message}); nothing is offered`);
        return sanitizeConfig({});
    }
    try {
        return sanitizeConfig(JSON.parse(text));
    } catch (error) {
        log(`config.json is not valid JSON (${error?.message ?? 'parse error'}); nothing is offered until it is fixed`);
        return sanitizeConfig({});
    }
}

export const isShim = (file) => SHIM_EXTENSIONS.has(path.extname(file).toLowerCase());

export function resolveBinary(harness, { configured = null, env = process.env, platform = process.platform, exists = fs.existsSync } = {}) {
    if (configured) {
        if (isShim(configured)) return { path: null, error: `${configured} is a script shim; point the plugin at the real executable` };
        return exists(configured) ? { path: configured, error: null } : { path: null, error: `${configured} does not exist` };
    }
    const dirs = (env.PATH ?? env.Path ?? '').split(platform === 'win32' ? ';' : ':').filter(Boolean);
    const names = platform === 'win32' ? [`${harness}.exe`] : [harness];
    for (const dir of dirs) {
        for (const name of names) {
            const candidate = path.join(dir, name);
            if (exists(candidate)) return { path: candidate, error: null };
        }
    }
    const shim = platform === 'win32' ? dirs.flatMap((dir) => ['.cmd', '.ps1', '.bat'].map((ext) => path.join(dir, `${harness}${ext}`))).find((file) => exists(file)) : null;
    return { path: null, error: shim ? `only a script shim was found (${path.basename(shim)}); set harnesses.${harness}.binary to the real executable` : `${harness} was not found on PATH` };
}

export function realLoginFile(harness, env = process.env, home = os.homedir()) {
    if (harness === 'claude') return path.join(env.CLAUDE_CONFIG_DIR || path.join(home, '.claude'), '.credentials.json');
    if (harness === 'codex') return path.join(env.CODEX_HOME || path.join(home, '.codex'), 'auth.json');
    return path.join(env.XDG_DATA_HOME || path.join(home, '.local', 'share'), 'opencode', 'auth.json');
}

const LOGIN_DEST = { claude: ['config', '.credentials.json'], codex: ['config', 'auth.json'], opencode: ['data', 'opencode', 'auth.json'] };

const jwtExpiry = (token) => {
    try {
        return JSON.parse(Buffer.from(String(token).split('.')[1], 'base64url').toString('utf8')).exp * 1000;
    } catch {
        return null;
    }
};

export const modelProvider = (model) => (typeof model === 'string' && model.includes('/') ? model.slice(0, model.indexOf('/')) : null);

export function loginFreshness(harness, file, { now = Date.now(), minMinutes = LIMITS.loginMinMinutes, readFile = fs.readFileSync, providers = null } = {}) {
    let parsed;
    try {
        parsed = JSON.parse(readFile(file, 'utf8'));
    } catch {
        return { loggedIn: false, fresh: false, reason: 'no login file: log in with the CLI on this machine' };
    }
    const floor = now + minMinutes * 60_000;
    const stale = `the saved login expires within ${minMinutes} min or has expired: run \`${harness}\` once in a terminal on this machine to refresh it`;
    if (harness === 'claude') {
        const oauth = parsed?.claudeAiOauth;
        if (!isRecord(oauth)) return { loggedIn: false, fresh: false, reason: 'no subscription login in the saved file (API keys are not used)' };
        return oauth.expiresAt > floor ? { loggedIn: true, fresh: true, reason: null } : { loggedIn: true, fresh: false, reason: stale };
    }
    if (harness === 'codex') {
        if (!isRecord(parsed?.tokens)) return { loggedIn: false, fresh: false, reason: 'no ChatGPT login in the saved file (API keys are not used)' };
        const age = now - Date.parse(parsed.last_refresh ?? '');
        if (!(jwtExpiry(parsed.tokens.access_token) > floor)) return { loggedIn: true, fresh: false, reason: stale };
        if (!(age < 7 * 86_400_000)) return { loggedIn: true, fresh: false, reason: `the saved login was last refreshed over 7 days ago: run \`codex\` once in a terminal on this machine` };
        return { loggedIn: true, fresh: true, reason: null };
    }
    const oauth = Object.entries(isRecord(parsed) ? parsed : {}).filter(([name, entry]) => entry?.type === 'oauth' && (!providers || providers.includes(name)));
    if (!oauth.length) return { loggedIn: false, fresh: false, reason: providers ? `no subscription (oauth) login for ${providers.join(', ')} in the saved file` : 'no subscription (oauth) login in the saved file' };
    return oauth.every(([, entry]) => entry.expires > floor) ? { loggedIn: true, fresh: true, reason: null } : { loggedIn: true, fresh: false, reason: stale };
}

const digest = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
const sha256 = (file, readFile = fs.readFileSync) => digest(readFile(file));

export function ownedLoginCopy(harness, text, model) {
    if (harness !== 'opencode') return text;
    const provider = modelProvider(model);
    const parsed = JSON.parse(text);
    const entry = provider && isRecord(parsed) ? parsed[provider] : null;
    return JSON.stringify(entry?.type === 'oauth' ? { [provider]: entry } : {});
}

export function openOwnedHome(harness, { tmpRoot, loginFile, model = null, cacheDir = null, fsImpl = fs }) {
    fsImpl.mkdirSync(path.join(tmpRoot, 'calls'), { recursive: true });
    const root = fsImpl.mkdtempSync(path.join(tmpRoot, 'calls', `${harness}-`));
    const dirs = { root };
    for (const name of ['home', 'config', 'data', 'cache', 'state', 'tmp', 'cwd']) {
        dirs[name] = path.join(root, name);
        fsImpl.mkdirSync(dirs[name], { recursive: true });
    }
    if (cacheDir) {
        fsImpl.mkdirSync(cacheDir, { recursive: true });
        dirs.cache = cacheDir;
    }
    for (const name of ['AppData/Roaming', 'AppData/Local']) fsImpl.mkdirSync(path.join(dirs.home, name), { recursive: true });
    const real = fsImpl.readFileSync(loginFile);
    const before = digest(real);
    const copy = path.join(root, ...LOGIN_DEST[harness]);
    fsImpl.mkdirSync(path.dirname(copy), { recursive: true });
    const copied = harness === 'opencode' ? ownedLoginCopy(harness, real.toString('utf8'), model) : real;
    fsImpl.writeFileSync(copy, copied);
    return { ...dirs, loginFile, copy, before, copyBefore: digest(copied) };
}

export function closeOwnedHome(home, fsImpl = fs) {
    const report = { copyRewritten: false, realChanged: false, removed: false };
    try {
        report.copyRewritten = fsImpl.existsSync(home.copy) && sha256(home.copy, fsImpl.readFileSync) !== (home.copyBefore ?? home.before);
    } catch {
        report.copyRewritten = false;
    }
    try { fsImpl.rmSync(home.copy, { force: true }); } catch { /* removed with the root below */ }
    try {
        report.realChanged = sha256(home.loginFile, fsImpl.readFileSync) !== home.before;
    } catch {
        report.realChanged = true;
    }
    try { fsImpl.rmSync(home.root, RM_RETRY); } catch { report.removed = false; }
    report.removed = !fsImpl.existsSync(home.root);
    return report;
}

export function sweepCalls(tmpRoot, fsImpl = fs) {
    const calls = path.join(tmpRoot, 'calls');
    let names = [];
    try { names = fsImpl.readdirSync(calls); } catch { return { swept: 0, left: 0 }; }
    let left = 0;
    for (const name of names) {
        try { fsImpl.rmSync(path.join(calls, name), RM_RETRY); } catch { left += 1; }
    }
    return { swept: names.length - left, left };
}

export function childEnv(harness, home, parent = process.env) {
    const env = {};
    for (const key of [...BASE_ENV, ...PASS_THROUGH_ENV]) if (typeof parent[key] === 'string') env[key] = parent[key];
    Object.assign(env, {
        USERPROFILE: home.home,
        HOME: home.home,
        APPDATA: path.join(home.home, 'AppData', 'Roaming'),
        LOCALAPPDATA: path.join(home.home, 'AppData', 'Local'),
        TEMP: home.tmp,
        TMP: home.tmp,
        TMPDIR: home.tmp,
    });
    if (/^[A-Za-z]:/.test(home.home)) Object.assign(env, { HOMEDRIVE: home.home.slice(0, 2), HOMEPATH: home.home.slice(2) });
    if (harness === 'claude') env.CLAUDE_CONFIG_DIR = home.config;
    if (harness === 'codex') env.CODEX_HOME = home.config;
    if (harness === 'opencode') {
        Object.assign(env, OPENCODE_QUIET, {
            XDG_CONFIG_HOME: home.config,
            XDG_DATA_HOME: home.data,
            XDG_CACHE_HOME: home.cache,
            XDG_STATE_HOME: home.state,
            OPENCODE_CONFIG_CONTENT: opencodeAgent(home.systemFile),
        });
    }
    return env;
}

export const opencodeAgent = (systemFile) => JSON.stringify({
    $schema: 'https://opencode.ai/config.json',
    agent: { 'so-text': { mode: 'primary', prompt: `{file:${systemFile}}`, tools: { '*': false }, permission: { edit: 'deny', bash: 'deny', webfetch: 'deny' } } },
});

export function buildArgv(harness, { model, effort = null, systemFile, cwd }) {
    const level = EFFORTS.includes(effort) ? effort : null;
    if (harness === 'claude') {
        return ['-p', '--tools', '', '--strict-mcp-config', '--setting-sources', '', '--no-session-persistence', '--exclude-dynamic-system-prompt-sections',
            '--system-prompt-file', systemFile, '--output-format', 'json', '--model', model, ...(level ? ['--effort', level] : [])];
    }
    if (harness === 'codex') {
        return ['exec', '-', '--json', '--ephemeral', '--skip-git-repo-check', '--ignore-user-config', '--ignore-rules', '-s', 'read-only', '-C', cwd,
            ...CODEX_TOOL_FEATURES.flatMap((feature) => ['--disable', feature]), ...(model === 'default' ? [] : ['-m', model]),
            ...(level ? ['-c', `model_reasoning_effort="${level}"`] : [])];
    }
    return ['run', '--pure', '--format', 'json', '--agent', 'so-text', '-m', model, '--dir', cwd, ...(level ? ['--variant', level] : [])];
}

export const stdinFor = (harness, { system, prompt }) => (harness === 'codex' ? `${system}\n\n${prompt}` : prompt);

export function parseJsonl(text) {
    const events = [];
    for (const line of text.split(/\r?\n/)) {
        const trimmed = line.trim();
        if (!trimmed.startsWith('{')) continue;
        try { events.push(JSON.parse(trimmed)); } catch { /* not an event line */ }
    }
    return events;
}

const finishOf = (reason) => {
    if (typeof reason !== 'string') return 'unknown';
    if (/max_tokens|length|limit/i.test(reason)) return 'length';
    return /end_turn|stop|complete|stop_sequence/i.test(reason) ? 'stop' : 'unknown';
};

export function parseOutput(harness, stdout) {
    const events = parseJsonl(stdout);
    if (harness === 'claude') {
        const result = [...events].reverse().find((event) => event.type === 'result');
        if (!result) return { text: '', finish: 'unknown', usage: null, errors: [], toolEvents: 0, parsed: false };
        const usage = isRecord(result.usage) ? result.usage : {};
        const input = (usage.input_tokens ?? 0) + (usage.cache_creation_input_tokens ?? 0) + (usage.cache_read_input_tokens ?? 0);
        const errors = result.is_error ? [{ status: result.api_error_status ?? null, message: typeof result.result === 'string' ? result.result : 'error' }] : [];
        return {
            text: !result.is_error && typeof result.result === 'string' ? result.result : '',
            finish: finishOf(result.stop_reason),
            usage: { input, output: usage.output_tokens ?? null, costUsd: typeof result.total_cost_usd === 'number' ? result.total_cost_usd : null },
            errors,
            toolEvents: Array.isArray(result.permission_denials) ? result.permission_denials.length : 0,
            parsed: true,
        };
    }
    if (harness === 'codex') {
        const items = events.filter((event) => event.type === 'item.completed').map((event) => event.item ?? {});
        const usage = events.filter((event) => event.type === 'turn.completed').map((event) => event.usage ?? {});
        const errors = events.filter((event) => event.type === 'error' || event.type === 'turn.failed')
            .map((event) => ({ status: null, message: String(event.message ?? event.error?.message ?? JSON.stringify(event)) }));
        return {
            text: items.filter((item) => item.type === 'agent_message').map((item) => item.text ?? '').join(''),
            finish: usage.length ? 'stop' : 'unknown',
            usage: usage.length ? { input: usage.reduce((sum, row) => sum + (row.input_tokens ?? 0), 0), output: usage.reduce((sum, row) => sum + (row.output_tokens ?? 0), 0), costUsd: null } : null,
            errors,
            toolEvents: items.filter((item) => !['agent_message', 'reasoning'].includes(item.type)).length,
            parsed: events.length > 0,
        };
    }
    const finishes = events.filter((event) => event.type === 'step_finish').map((event) => event.part ?? {});
    const tokens = finishes.map((part) => part.tokens).filter(isRecord);
    const errors = events.filter((event) => event.type === 'error').map((event) => {
        const error = event.error ?? {};
        return { status: error.data?.statusCode ?? error.statusCode ?? null, message: String(error.data?.message ?? error.message ?? error.name ?? 'error') };
    });
    return {
        text: events.filter((event) => event.type === 'text').map((event) => event.part?.text ?? '').join(''),
        finish: finishes.length ? finishOf(finishes[finishes.length - 1].reason) : 'unknown',
        usage: tokens.length ? { input: tokens.reduce((sum, row) => sum + (row.input ?? 0) + (row.cache?.read ?? 0), 0), output: tokens.reduce((sum, row) => sum + (row.output ?? 0), 0), costUsd: null } : null,
        errors,
        toolEvents: events.filter((event) => /tool/i.test(event.type) || /tool/i.test(event.part?.type ?? '')).length,
        parsed: events.length > 0,
    };
}

const AUTH_TEXT = /not logged in|please run \/login|401|unauthori[sz]ed|authenticat|invalid (api key|token)|oauth token|login required|403 forbidden/i;
const QUOTA_TEXT = /usage limit|rate.?limit|\b429\b|quota|insufficient balance|limit reached|too many requests/i;
const NETWORK_TEXT = /ECONNREFUSED|ECONNRESET|ENOTFOUND|EAI_AGAIN|ETIMEDOUT|certificate|self.signed|unable to verify|proxy|tls|socket hang up/i;

export function readRetryAt(text, now = Date.now()) {
    const match = /(?:try again|resets?|available again)\s+(?:at|on|after)\s+([^.\n)]+)/i.exec(text);
    if (!match) return null;
    const at = Date.parse(match[1].replace(/(\d)(st|nd|rd|th)\b/g, '$1').replace(/\s+\([^)]*\)/, '').trim());
    return Number.isFinite(at) && at > now ? at : null;
}

export function classify(harness, run, { maxOutputChars, now = Date.now() } = {}) {
    if (run.spawnError) return { ok: false, kind: 'config', message: `${harness} could not be started: ${run.spawnError}` };
    if (run.killed === 'deadline') return { ok: false, kind: 'timeout', message: `${harness} did not answer before the deadline; its process tree was stopped` };
    if (run.killed === 'cancelled') return { ok: false, kind: 'lapsed', message: 'the request was cancelled' };
    const parsed = parseOutput(harness, run.stdout);
    const errorText = parsed.errors.map((error) => `${error.status ?? ''} ${error.message}`).join(' | ');
    const statuses = parsed.errors.map((error) => Number(error.status)).filter(Number.isFinite);
    if (parsed.toolEvents > 0) return { ok: false, kind: 'refused', message: `${harness} attempted ${parsed.toolEvents} tool call(s) with tools off; the answer is discarded` };
    if (run.killed === 'output-bound') {
        return parsed.text ? { ok: true, text: parsed.text.slice(0, maxOutputChars), finish: 'length', usage: parsed.usage } : { ok: false, kind: 'malformed', message: `${harness} output passed its bound before a reply could be read` };
    }
    if (parsed.text && (!parsed.errors.length || parsed.finish !== 'unknown')) {
        const cut = maxOutputChars && parsed.text.length > maxOutputChars;
        const warnings = parsed.errors.map((error) => `${error.status ?? ''} ${error.message}`.trim().slice(0, 200));
        return { ok: true, text: cut ? parsed.text.slice(0, maxOutputChars) : parsed.text, finish: cut ? 'length' : parsed.finish, usage: parsed.usage, ...(warnings.length ? { warnings } : {}) };
    }
    const evidence = `${errorText} ${run.stderr ?? ''}`;
    if (statuses.includes(401) || statuses.includes(403) || AUTH_TEXT.test(evidence)) {
        return { ok: false, kind: 'auth', message: `${harness} is not logged in on the machine running SillyTavern: run \`${harness}\` once in a terminal there` };
    }
    if (statuses.includes(429) || QUOTA_TEXT.test(evidence)) {
        const retryAt = readRetryAt(evidence, now);
        return { ok: false, kind: 'quota', message: `${harness} reports its usage limit${retryAt ? ` until ${new Date(retryAt).toISOString()}` : ''}`, ...(retryAt ? { retryAt } : {}) };
    }
    if (NETWORK_TEXT.test(evidence)) return { ok: false, kind: 'transport', message: `${harness} could not reach its vendor (a proxy or CA certificate setting is a likely cause): ${errorText || 'connection failed'}`.slice(0, 400) };
    if (parsed.errors.length) return { ok: false, kind: 'transport', message: `${harness} answered with an error: ${errorText}`.slice(0, 400) };
    if (!parsed.parsed) return { ok: false, kind: 'malformed', message: `${harness} exited ${run.code ?? '?'} without readable output` };
    return { ok: false, kind: 'malformed', message: `${harness} answered with no text` };
}

export function killTreeDefault(pid, platform = process.platform) {
    return new Promise((resolve) => {
        if (!pid) return resolve();
        if (platform === 'win32') return execFile('taskkill', ['/pid', String(pid), '/T', '/F'], { windowsHide: true }, () => resolve());
        try { process.kill(-pid, 'SIGKILL'); } catch { try { process.kill(pid, 'SIGKILL'); } catch { /* already gone */ } }
        return resolve();
    });
}

export function runProcess({ bin, argv, env, cwd, stdin, deadlineMs, maxOutputChars, spawnImpl = spawn, killTree = killTreeDefault, signal = null, now = () => performance.now(), onStdout = null }) {
    const started = now();
    return new Promise((resolve) => {
        let child;
        try {
            child = spawnImpl(bin, argv, { env, cwd, shell: false, windowsHide: true, detached: process.platform !== 'win32', stdio: ['pipe', 'pipe', 'pipe'] });
        } catch (error) {
            resolve({ spawnError: `${error.code ?? ''} ${error.message}`.trim(), stdout: '', stderr: '', code: null, killed: null, ms: Math.round(now() - started), spawnMs: null });
            return;
        }
        let stdout = '';
        let stderr = '';
        let killed = null;
        let spawnMs = null;
        let killing = null;
        let settled = false;
        const kill = (why) => {
            if (killed) return;
            killed = why;
            killing = killTree(child.pid);
        };
        const timer = setTimeout(() => kill('deadline'), Math.max(0, deadlineMs));
        const onAbort = () => kill('cancelled');
        signal?.addEventListener('abort', onAbort);
        if (signal?.aborted) kill('cancelled');
        child.on('spawn', () => { spawnMs = Math.round(now() - started); });
        child.stdout?.on('data', (chunk) => {
            const text = chunk.toString('utf8');
            stdout += text;
            onStdout?.(text);
            if (maxOutputChars && stdout.length > maxOutputChars * 2 + 4096) kill('output-bound');
        });
        child.stderr?.on('data', (chunk) => { if (stderr.length < 64_000) stderr += chunk.toString('utf8'); });
        child.stdin?.on('error', () => undefined);
        child.stdin?.end(stdin);
        const finish = async (code, error) => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            signal?.removeEventListener('abort', onAbort);
            if (killing) await killing;
            resolve({ spawnError: error ? `${error.code ?? ''} ${error.message}`.trim() : null, stdout, stderr, code, killed, ms: Math.round(now() - started), spawnMs });
        };
        child.on('error', (error) => { void finish(null, error); });
        child.on('close', (code) => { void finish(code, null); });
    });
}

export function createGate(config) {
    const lanes = new Map(HARNESS_IDS.map((id) => [id, { running: 0, busyKeys: new Set(), queue: [] }]));
    const pump = (harness) => {
        const lane = lanes.get(harness);
        const limit = config.harnesses[harness].concurrency;
        for (let index = 0; index < lane.queue.length && lane.running < limit;) {
            const entry = lane.queue[index];
            if (lane.busyKeys.has(entry.key)) {
                index += 1;
                continue;
            }
            lane.queue.splice(index, 1);
            lane.running += 1;
            lane.busyKeys.add(entry.key);
            entry.resolve(() => {
                lane.running -= 1;
                lane.busyKeys.delete(entry.key);
                pump(harness);
            });
        }
    };
    return {
        acquire(harness, key, signal = null) {
            const lane = lanes.get(harness);
            if (lane.queue.length >= config.harnesses[harness].queueLimit) return null;
            return new Promise((resolve) => {
                const entry = { key, resolve };
                lane.queue.push(entry);
                signal?.addEventListener('abort', () => {
                    const at = lane.queue.indexOf(entry);
                    if (at < 0) return;
                    lane.queue.splice(at, 1);
                    resolve(null);
                });
                pump(harness);
            });
        },
        tryAcquire(harness) {
            const lane = lanes.get(harness);
            if (lane.running >= config.harnesses[harness].concurrency) return null;
            lane.running += 1;
            let released = false;
            return () => {
                if (released) return;
                released = true;
                lane.running -= 1;
                pump(harness);
            };
        },
        counts(harness) {
            const lane = lanes.get(harness);
            return { running: lane.running, queued: lane.queue.length };
        },
    };
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

export const isAdmin = (request) => request?.user?.profile?.admin === true;

export function mayCall(request, config) {
    if (!isRecord(request?.user?.profile)) return refusal(403, 'no SillyTavern user on the request');
    if (isAdmin(request) || config.allowNonAdmin) return null;
    return refusal(403, 'harness routes are admin-only on this install (they spend the host owner\'s subscriptions)');
}

export async function readTextBody(request, limit = LIMITS.maxBodyBytes) {
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

export function validateComplete(body, config) {
    if (!isRecord(body)) return { issue: 'body must be a JSON object', kind: 'config' };
    const { requestId, harness, model, role, system, prompt, timeoutMs, maxOutputChars, effort } = body;
    if (typeof requestId !== 'string' || !ID_PATTERN.test(requestId)) return { issue: 'requestId must be 1-64 of [A-Za-z0-9_-]', kind: 'config' };
    if (!HARNESS_IDS.includes(harness)) return { issue: `unknown harness ${String(harness)}`, kind: 'config' };
    if (typeof role !== 'string' || !ROLE_PATTERN.test(role)) return { issue: 'role must be a role id', kind: 'config' };
    if (typeof model !== 'string' || !config.harnesses[harness].models.some((entry) => entry.id === model)) {
        return { issue: `model not permitted for ${harness}: ${String(model).slice(0, 80)}`, kind: 'config' };
    }
    if (typeof system !== 'string' || typeof prompt !== 'string' || !prompt.trim()) return { issue: 'system and a non-empty prompt must be strings', kind: 'config' };
    if (prompt.length > LIMITS.maxPromptChars) return { issue: `prompt is over ${LIMITS.maxPromptChars} chars`, kind: 'refused' };
    if (system.length > LIMITS.maxSystemChars) return { issue: `system is over ${LIMITS.maxSystemChars} chars`, kind: 'refused' };
    if (!Number.isInteger(timeoutMs) || timeoutMs < LIMITS.minTimeoutMs || timeoutMs > LIMITS.maxTimeoutMs) return { issue: `timeoutMs must be ${LIMITS.minTimeoutMs}-${LIMITS.maxTimeoutMs}`, kind: 'config' };
    if (!Number.isInteger(maxOutputChars) || maxOutputChars < 1 || maxOutputChars > LIMITS.maxOutputChars) return { issue: `maxOutputChars must be 1-${LIMITS.maxOutputChars}`, kind: 'config' };
    if (effort !== undefined && effort !== null && !EFFORTS.includes(effort)) return { issue: `effort must be one of ${EFFORTS.join(', ')}`, kind: 'config' };
    return { issue: null, value: { requestId, harness, model, role, system, prompt, timeoutMs, maxOutputChars, effort: effort ?? null } };
}

const readVersion = (bin, spawnImpl, killTree) => runProcess({ bin, argv: ['--version'], env: { PATH: process.env.PATH ?? process.env.Path ?? '', SystemRoot: process.env.SystemRoot ?? '' }, cwd: os.tmpdir(), stdin: '', deadlineMs: LIMITS.versionTimeoutMs, maxOutputChars: 2000, spawnImpl, killTree })
    .then((run) => (run.code === 0 ? (run.stdout.match(/\d+\.\d+\.\d+/)?.[0] ?? run.stdout.trim().slice(0, 40)) : null));

export function createHarnessService({
    config = loadConfig(),
    env = process.env,
    home = os.homedir(),
    spawnImpl = spawn,
    killTree = killTreeDefault,
    fsImpl = fs,
    now = Date.now,
    log = (line) => console.log(`[story-orchestrator-harness] ${line}`),
    bridge = {},
} = {}) {
    const gate = createGate(config);
    const inFlight = new Map();
    const state = Object.fromEntries(HARNESS_IDS.map((id) => [id, { spawns: 0, quotaUntil: null, quotaHeld: false, blocked: null, blockedHash: null, copyRewrites: 0, leakedHomes: 0 }]));
    const holdMs = quotaHoldMs(env);
    const noteQuota = (harness, retryAt) => {
        const until = retryAt ?? (holdMs > 0 ? now() + holdMs : null);
        if (!until) return;
        state[harness].quotaUntil = until;
        state[harness].quotaHeld = !retryAt;
    };
    let probed = null;
    const cacheDir = path.join(config.tmpRoot, 'opencode-cache');
    const warmMarker = path.join(cacheDir, '.so-warm');
    const loginFileOf = (harness) => config.harnesses[harness].loginFile ?? realLoginFile(harness, env, home);
    const swept = sweepCalls(config.tmpRoot, fsImpl);
    if (swept.swept || swept.left) log(JSON.stringify({ sweptHomes: swept.swept, leftHomes: swept.left }));

    const providersOf = (harness, model = null) => {
        if (harness !== 'opencode') return null;
        const models = model ? [model] : config.harnesses[harness].models.map((entry) => entry.id);
        return [...new Set(models.map(modelProvider).filter(Boolean))];
    };

    const freshness = (harness, model = null) => loginFreshness(harness, loginFileOf(harness), { now: now(), minMinutes: config.loginMinMinutes, readFile: fsImpl.readFileSync, providers: providersOf(harness, model) });

    const realHash = (harness) => {
        try {
            return sha256(loginFileOf(harness), fsImpl.readFileSync);
        } catch {
            return null;
        }
    };

    const heldFor = (harness) => {
        const current = state[harness];
        if (!current.blocked) return null;
        const hash = realHash(harness);
        if (hash && hash !== current.blockedHash && freshness(harness).fresh) {
            current.blocked = null;
            current.blockedHash = null;
            log(JSON.stringify({ harness, rearmed: true }));
            return null;
        }
        return current.blocked;
    };

    const noteClosed = (harness, closed, during) => {
        if (closed.copyRewritten) state[harness].copyRewrites += 1;
        if (!closed.removed) {
            state[harness].leakedHomes += 1;
            log(JSON.stringify({ harness, leakedHome: true }));
        }
        if (closed.realChanged) {
            state[harness].blocked = `${harness}'s real login file changed during ${during}; calls are held until ${harness} is logged in again on this machine`;
            state[harness].blockedHash = realHash(harness);
        }
    };

    const probe = async () => {
        const rows = await Promise.all(HARNESS_IDS.map(async (harness) => {
            const entry = config.harnesses[harness];
            if (!entry.offer) return [harness, { binary: { path: null, error: `${harness} is not offered on this install (config.json)` }, version: null }];
            const binary = resolveBinary(harness, { configured: entry.binary, env, exists: fsImpl.existsSync });
            const version = binary.path ? await readVersion(binary.path, spawnImpl, killTree).catch(() => null) : null;
            return [harness, { binary, version }];
        }));
        probed = { at: now(), rows: Object.fromEntries(rows) };
        return probed;
    };

    const harnessStatus = (harness, admin) => {
        const entry = config.harnesses[harness];
        const row = probed?.rows[harness] ?? { binary: { path: null, error: 'not probed yet' }, version: null };
        const login = entry.offer ? freshness(harness) : { loggedIn: null, fresh: false, reason: null };
        const blocked = entry.offer ? heldFor(harness) : null;
        const counts = gate.counts(harness);
        const quotaUntil = state[harness].quotaUntil && state[harness].quotaUntil > now() ? state[harness].quotaUntil : null;
        return {
            installed: Boolean(row.binary.path),
            version: row.version,
            ...(admin ? { path: row.binary.path } : {}),
            problem: row.binary.error,
            loggedIn: login.loggedIn,
            fresh: login.fresh,
            loginProblem: blocked ?? login.reason,
            blocked,
            offered: entry.offer,
            isolation: PHASE0[harness],
            models: entry.models.map((model) => ({ ...model })),
            concurrency: entry.concurrency,
            queueLimit: entry.queueLimit,
            running: counts.running,
            queued: counts.queued,
            spawns: state[harness].spawns,
            leakedHomes: state[harness].leakedHomes,
            quotaUntil,
            ...(harness === 'opencode' ? { cacheWarm: fsImpl.existsSync(warmMarker) } : {}),
            agentBridge: entry.offer && BRIDGE_HARNESSES.includes(harness),
        };
    };

    const status = async ({ refresh = false, admin = false } = {}) => {
        if (!probed || refresh) await probe();
        return {
            pluginVersion: PLUGIN_VERSION,
            allowNonAdmin: config.allowNonAdmin,
            harnesses: Object.fromEntries(HARNESS_IDS.map((harness) => [harness, harnessStatus(harness, admin)])),
        };
    };

    const preconditions = (request, { warming = false } = {}) => {
        const { harness } = request;
        const entry = config.harnesses[harness];
        const row = probed?.rows[harness];
        if (!entry.offer) return { kind: 'config', message: `${harness} is not offered on this install (Phase 0: ${PHASE0[harness]}); the host owner turns it on in the plugin's config.json` };
        if (!row?.binary.path) return { kind: 'config', message: `${harness} is not installed on the machine running SillyTavern (${row?.binary.error ?? 'not probed'})` };
        const held = heldFor(harness);
        if (held) return { kind: 'auth', message: held };
        const login = freshness(harness, request.model ?? null);
        if (!login.fresh) return { kind: 'auth', message: `${harness}: ${login.reason}` };
        if (state[harness].quotaUntil && state[harness].quotaUntil > now()) {
            const until = new Date(state[harness].quotaUntil).toISOString();
            const message = state[harness].quotaHeld
                ? `${harness} reported its usage limit with no retry time; calls are held until ${until} (SO_HARNESS_QUOTA_HOLD_MS)`
                : `${harness} reported its usage limit until ${until}`;
            return { kind: 'quota', message, retryAt: state[harness].quotaUntil };
        }
        if (harness === 'opencode' && !warming && !fsImpl.existsSync(warmMarker)) {
            return { kind: 'config', message: 'opencode\'s model cache is not warmed yet: the host owner runs the warm-up once (POST /warm, admin), which is the only call that may contact opencode\'s catalog' };
        }
        return null;
    };

    const execute = async (request, { signal = null, user = 'default-user', warming = false } = {}) => {
        const arrived = now();
        if (!probed) await probe();
        const blocked = preconditions(request, { warming });
        if (blocked) return { ok: false, ...blocked };
        const key = `${user}|${request.harness}|${request.role}`;
        const acquired = gate.acquire(request.harness, key, signal);
        if (acquired === null) return { ok: false, kind: 'busy', message: `${request.harness} has ${config.harnesses[request.harness].queueLimit} calls queued; retry shortly` };
        const release = await acquired;
        if (!release) return { ok: false, kind: 'lapsed', message: 'the request was cancelled while queued' };
        let owned = null;
        try {
            const remaining = request.timeoutMs - LIMITS.deadlineMarginMs - (now() - arrived);
            if (remaining <= 0) return { ok: false, kind: 'timeout', message: `${request.harness} waited in the queue past its deadline` };
            owned = openOwnedHome(request.harness, { tmpRoot: config.tmpRoot, loginFile: loginFileOf(request.harness), model: request.model, cacheDir: request.harness === 'opencode' ? cacheDir : null, fsImpl });
            owned.systemFile = path.join(owned.tmp, 'system.txt');
            fsImpl.writeFileSync(owned.systemFile, request.system, 'utf-8');
            const childEnvironment = childEnv(request.harness, owned, env);
            if (warming) delete childEnvironment.OPENCODE_DISABLE_MODELS_FETCH;
            state[request.harness].spawns += 1;
            const run = await runProcess({
                bin: probed.rows[request.harness].binary.path,
                argv: buildArgv(request.harness, { model: request.model, effort: request.effort, systemFile: owned.systemFile, cwd: owned.cwd }),
                env: childEnvironment,
                cwd: owned.cwd,
                stdin: stdinFor(request.harness, request),
                deadlineMs: remaining,
                maxOutputChars: request.maxOutputChars,
                spawnImpl,
                killTree,
                signal,
            });
            const outcome = classify(request.harness, run, { maxOutputChars: request.maxOutputChars, now: now() });
            if (outcome.kind === 'quota') noteQuota(request.harness, outcome.retryAt ?? null);
            return { ...outcome, model: request.model, ms: now() - arrived, spawnMs: run.spawnMs, effortApplied: EFFORTS.includes(request.effort) };
        } catch (error) {
            return { ok: false, kind: 'config', message: `${request.harness}: the plugin could not prepare the call (${error?.code ?? error?.message ?? 'error'})` };
        } finally {
            if (owned) noteClosed(request.harness, closeOwnedHome(owned, fsImpl), 'a call');
            release();
        }
    };

    const complete = async (request, options = {}) => {
        const entry = { user: options.user ?? 'default-user', controller: new AbortController() };
        const key = `${entry.user}|${request.requestId}`;
        inFlight.set(key, entry);
        const onAbort = () => entry.controller.abort();
        options.signal?.addEventListener('abort', onAbort);
        try {
            const answer = await execute(request, { signal: entry.controller.signal, user: entry.user });
            log(JSON.stringify({ harness: request.harness, model: request.model, ms: answer.ms ?? null, usage: answer.usage ?? null, kind: answer.ok ? 'ok' : answer.kind }));
            return answer;
        } finally {
            options.signal?.removeEventListener('abort', onAbort);
            if (inFlight.get(key) === entry) inFlight.delete(key);
        }
    };

    const cancel = (requestId, user) => {
        const entry = inFlight.get(`${user}|${requestId}`);
        if (!entry) return false;
        entry.controller.abort();
        return true;
    };

    const warm = async () => {
        if (!probed) await probe();
        const model = config.harnesses.opencode.models[0].id;
        const answer = await execute({ requestId: 'warm', harness: 'opencode', model, role: 'warm', system: 'Reply with exactly: PONG', prompt: 'Reply now.', timeoutMs: 120_000, maxOutputChars: 200, effort: null }, { warming: true });
        if (answer.ok) fsImpl.writeFileSync(warmMarker, new Date(now()).toISOString(), 'utf-8');
        return answer.ok ? { ok: true } : answer;
    };

    const agent = createAgentBridge({
        config,
        env,
        spawnImpl,
        killTree,
        fsImpl,
        now,
        limits: LIMITS,
        helpers: { openOwnedHome, closeOwnedHome, childEnv, runProcess, classify },
        host: {
            ready: async (harness, model = null) => {
                if (!probed) await probe();
                return preconditions({ harness, model });
            },
            reserve: (harness) => gate.tryAcquire(harness),
            binary: (harness) => probed.rows[harness].binary.path,
            loginFile: loginFileOf,
            cacheDir,
            noteSpawn: (harness) => { state[harness].spawns += 1; },
            log: (line) => log(`agent ${line}`),
            noteQuota,
            noteClosed: (harness, closed) => noteClosed(harness, closed, 'an agent session'),
        },
        ...bridge,
    });

    const shutdown = () => {
        for (const entry of inFlight.values()) entry.controller.abort();
        return agent.shutdown();
    };

    return { status, complete, cancel, warm, shutdown, probe, gate, state, agent };
}

export function guardRoute(handler, log = (line) => console.error(`[story-orchestrator-harness] ${line}`)) {
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
                response.status(500).json({ error: 'the harness plugin failed on this request' });
            } catch {
                return;
            }
        });
    };
}

const userHandle = (request) => request?.user?.profile?.handle ?? 'default-user';

export function createHandlers(service, config) {
    const entry = async (request, response, run) => {
        const blocked = guardRequest(request) ?? mayCall(request, config);
        if (blocked) return response.status(blocked.status).json({ error: blocked.error });
        const read = await readTextBody(request);
        if (read.error) return response.status(read.status).json({ error: read.error });
        return run(read.body);
    };
    return {
        async status(request, response) {
            const allowed = mayCall(request, config) === null;
            if (!allowed) return response.status(403).json({ error: 'harness routes are admin-only on this install' });
            return response.json(await service.status({ refresh: request?.query?.refresh === '1', admin: isAdmin(request) }));
        },
        complete(request, response) {
            return entry(request, response, async (body) => {
                const checked = validateComplete(body, config);
                if (checked.issue) return response.json({ ok: false, kind: checked.kind, message: checked.issue });
                const controller = new AbortController();
                response.on?.('close', () => { if (!response.writableFinished) controller.abort(); });
                const answer = await service.complete(checked.value, { signal: controller.signal, user: userHandle(request) });
                return answer.kind === 'busy' ? response.status(429).json(answer) : response.json(answer);
            });
        },
        cancel(request, response) {
            return entry(request, response, async (body) => {
                const requestId = isRecord(body) && typeof body.requestId === 'string' ? body.requestId : '';
                return response.json({ cancelled: service.cancel(requestId, userHandle(request)) });
            });
        },
        warm(request, response) {
            return entry(request, response, async () => {
                if (!isAdmin(request)) return response.status(403).json({ error: 'the warm-up is admin-only' });
                return response.json(await service.warm());
            });
        },
        agentOpen(request, response) {
            return entry(request, response, async (body) => {
                const checked = validateOpen(body, config, LIMITS);
                if (checked.issue) return response.json({ ok: false, kind: checked.kind, message: checked.issue });
                const opened = await service.agent.open(checked.value, { user: userHandle(request) });
                return opened.kind === 'busy' ? response.status(429).json(opened) : response.json(opened);
            });
        },
        agentNext(request, response) {
            return entry(request, response, async (body) => {
                const controller = new AbortController();
                response.on?.('close', () => { if (!response.writableFinished) controller.abort(); });
                const found = await service.agent.next(isRecord(body) ? body.sessionId : null, { user: userHandle(request), waitMs: isRecord(body) ? body.waitMs : undefined, signal: controller.signal });
                return found.error ? response.status(found.error.status).json({ error: found.error.error }) : response.json(found.event);
            });
        },
        agentAnswer(request, response) {
            return entry(request, response, async (body) => {
                const fields = isRecord(body) ? body : {};
                const found = service.agent.answer(fields.sessionId, { user: userHandle(request), callId: fields.callId, ok: fields.ok, text: fields.text });
                return found.error ? response.status(found.error.status).json({ error: found.error.error }) : response.json(found.value);
            });
        },
        agentClose(request, response) {
            return entry(request, response, async (body) => {
                const found = await service.agent.close(isRecord(body) ? body.sessionId : null, { user: userHandle(request) });
                return found.error ? response.status(found.error.status).json({ error: found.error.error }) : response.json(found.value);
            });
        },
    };
}

let running = null;

export async function init(router) {
    const config = loadConfig();
    const service = createHarnessService({ config });
    running = service;
    const handlers = createHandlers(service, config);
    router.get('/status', guardRoute(handlers.status));
    router.post('/complete', guardRoute(handlers.complete));
    router.post('/cancel', guardRoute(handlers.cancel));
    router.post('/warm', guardRoute(handlers.warm));
    router.post('/agent/open', guardRoute(handlers.agentOpen));
    router.post('/agent/next', guardRoute(handlers.agentNext));
    router.post('/agent/answer', guardRoute(handlers.agentAnswer));
    router.post('/agent/close', guardRoute(handlers.agentClose));
    const offered = HARNESS_IDS.filter((id) => config.harnesses[id].offer);
    console.log(`[story-orchestrator-harness] loaded; offered: ${offered.length ? offered.join(', ') : 'none (config.json)'}; admin-only: ${!config.allowNonAdmin}`);
}

export async function exit() {
    await running?.shutdown();
    running = null;
}

export default { info, init, exit };
