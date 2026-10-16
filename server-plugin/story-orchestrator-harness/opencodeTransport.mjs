import crypto from 'node:crypto';
import { execFile } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { BRIDGE_AGENT, BRIDGE_SERVER, SHIM_PATH } from './agentBridge.mjs';
import { AUTH_TEXT, NETWORK_TEXT, QUOTA_TEXT, readRetryAt } from './errors.mjs';

export const OPENCODE_CLIENT = Object.freeze({ name: '@opencode/client', version: '2.0.28' });
export const TEXT_AGENT = 'so-text';
export const SESSION_TITLE = 'so-harness';
export const SESSION_OWNER = 'story-orchestrator-harness';
export const OPENCODE_LIMITS = Object.freeze({
    maxImages: 4,
    maxImageBytes: 8_000_000,
    maxImageBytesTotal: 20_000_000,
    connectMs: 20_000,
    startMs: 30_000,
    subscribeMs: 3_000,
    pollMs: 1_500,
    statusTtlMs: 15_000,
    stopMs: 4_000,
    maxRetries: 3,
    configMs: 8_000,
    toolsSettleMs: 750,
    locationStaleMs: 7 * 24 * 3_600_000,
    maxMessagePages: 20,
    pageSize: 100,
    messageSettleTries: 5,
});
export const LOGIN_ACTION = 'in a terminal on this machine run `opencode auth login` and sign in (choose the provider, then its subscription option); the plugin never reads, copies or refreshes the login';

const DENY_ALL = Object.freeze([Object.freeze({ action: '*', resource: '*', effect: 'deny' })]);
const FOREIGN_PROBES = Object.freeze(['shell', 'edit', 'read', 'glob', 'grep', 'webfetch', 'websearch', 'skill', 'subagent', 'question', 'execute', 'external_directory', 'zz_other_tool']);
const IMAGE_MIMES = Object.freeze({ png: 'image/png', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp' });
const SIGN_IN_TEXT = /needs[_ .-]?auth|\b(please|must|need to|needs to)\b[\w ]{0,10}\bsign[ -]?in\b|\b(expired|invalid|missing|revoked|rejected|no)\b[\w ]{0,30}\b(credentials?|sign[ -]?in)\b|\b(credentials?|sign[ -]?in)\b[\w ]{0,30}\b(expired|invalid|missing|revoked|rejected|required|failed|again)\b/i;
const TERMINAL = new Set(['session.execution.succeeded', 'session.execution.failed', 'session.execution.interrupted']);

const isRecord = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const unwrap = (value) => (isRecord(value) && 'data' in value && !('id' in value) ? value.data : value);
const digest = (text) => crypto.createHash('sha256').update(text).digest('hex');
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const within = (ms, promise, failure, signal = null) => new Promise((resolve, reject) => {
    let timer = null;
    const fail = (kind) => reject(typeof failure === 'function' ? failure(kind) : new Error(failure));
    const stop = () => { clearTimeout(timer); signal?.removeEventListener('abort', aborted); };
    const aborted = () => { stop(); fail('lapsed'); };
    if (signal?.aborted) { aborted(); return; }
    timer = setTimeout(() => { stop(); fail('timeout'); }, Math.max(0, ms));
    signal?.addEventListener('abort', aborted, { once: true });
    promise.then((value) => { stop(); resolve(value); }, (error) => { stop(); reject(error); });
});
const SETUP_TIMEOUT = 'opencode did not answer before the deadline while the call was being set up; the call was abandoned and any session it opened is removed';
const lapse = (kind) => (kind === 'timeout' ? new Refused('timeout', SETUP_TIMEOUT) : new Refused('lapsed', 'the request was cancelled'));
const stalled = (error) => error instanceof Refused && (error.kind === 'timeout' || error.kind === 'lapsed');
const clip = (value, size = 400) => String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, size);

export class Refused extends Error {
    constructor(kind, message, extra = {}) {
        super(message);
        this.kind = kind;
        Object.assign(this, extra);
    }
}

export const splitModel = (model) => {
    const at = typeof model === 'string' ? model.indexOf('/') : -1;
    return at > 0 ? { providerID: model.slice(0, at), id: model.slice(at + 1) } : null;
};

const wildcard = (pattern) => new RegExp(`^${String(pattern).replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.')}$`, 'i');

export function evaluatePermission(rules, action, resource = '*') {
    let effect = 'ask';
    for (const rule of Array.isArray(rules) ? rules : []) {
        if (isRecord(rule) && wildcard(rule.action).test(action) && wildcard(rule.resource).test(resource)) effect = rule.effect;
    }
    return effect;
}

export const toolsDenied = (rules) => FOREIGN_PROBES.every((action) => evaluatePermission(rules, action) === 'deny');

export const bridgeOnly = (rules, names) => toolsDenied(rules) && names.every((name) => evaluatePermission(rules, `${BRIDGE_SERVER}_${name}`) === 'allow');

export const textRules = () => DENY_ALL.map((rule) => ({ ...rule }));
export const bridgeRules = () => [...textRules(), { action: `${BRIDGE_SERVER}_*`, resource: '*', effect: 'allow' }];

export const textConfig = (system) => JSON.stringify({
    $schema: 'https://opencode.ai/config.json',
    agents: { [TEXT_AGENT]: { mode: 'primary', description: 'Story Orchestrator text call: no tools', system, permissions: textRules() } },
}, null, 2);

export const bridgeConfig = ({ system, nodePath, shimPath = SHIM_PATH, pipe, secret, toolsFile, callTimeoutMs }) => JSON.stringify({
    $schema: 'https://opencode.ai/config.json',
    mcp: {
        servers: {
            [BRIDGE_SERVER]: {
                type: 'local',
                command: [nodePath, shimPath],
                environment: { SO_BRIDGE_PIPE: pipe, SO_BRIDGE_SECRET: secret, SO_BRIDGE_TOOLS: toolsFile },
                codemode: false,
                timeout: { startup: OPENCODE_LIMITS.connectMs, catalog: OPENCODE_LIMITS.connectMs, execution: callTimeoutMs + 10_000 },
            },
        },
    },
    agents: { [BRIDGE_AGENT]: { mode: 'primary', description: 'Story Orchestrator wizard: its own tools only', system, permissions: bridgeRules() } },
}, null, 2);

export function detectImage(bytes) {
    if (!Buffer.isBuffer(bytes) || bytes.length < 12) return null;
    if (bytes[0] === 0x89 && bytes.toString('latin1', 1, 4) === 'PNG') return IMAGE_MIMES.png;
    if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return IMAGE_MIMES.jpeg;
    if (bytes.toString('latin1', 0, 4) === 'GIF8') return IMAGE_MIMES.gif;
    if (bytes.toString('latin1', 0, 4) === 'RIFF' && bytes.toString('latin1', 8, 12) === 'WEBP') return IMAGE_MIMES.webp;
    return null;
}

export function prepareImages(images, { image = true } = {}) {
    if (images === undefined || images === null) return { files: [] };
    if (!Array.isArray(images) || images.length > OPENCODE_LIMITS.maxImages) return { issue: `images must be a list of at most ${OPENCODE_LIMITS.maxImages}` };
    let total = 0;
    const files = [];
    for (const [index, entry] of images.entries()) {
        if (!isRecord(entry) || typeof entry.data !== 'string' || !/^[A-Za-z0-9+/]+={0,2}$/.test(entry.data)) return { issue: `image ${index + 1} must carry base64 data` };
        const bytes = Buffer.from(entry.data, 'base64');
        if (bytes.length > OPENCODE_LIMITS.maxImageBytes) return { issue: `image ${index + 1} is over ${OPENCODE_LIMITS.maxImageBytes} bytes` };
        total += bytes.length;
        if (total > OPENCODE_LIMITS.maxImageBytesTotal) return { issue: `the images are over ${OPENCODE_LIMITS.maxImageBytesTotal} bytes together` };
        const mime = detectImage(bytes);
        if (!mime) return { issue: `image ${index + 1} is not a PNG, JPEG, GIF or WebP` };
        if (typeof entry.mime === 'string' && entry.mime !== mime) return { issue: `image ${index + 1} says ${entry.mime.slice(0, 40)} but its bytes are ${mime}` };
        files.push({ uri: `data:${mime};base64,${entry.data}`, name: `image-${index + 1}.${mime.slice(6)}`, description: typeof entry.description === 'string' ? entry.description.slice(0, 200) : undefined });
    }
    return image || !files.length ? { files } : { issue: 'the model takes no image input' };
}

const signInAction = (option) => LOGIN_ACTION.replace('choose the provider', `choose ${option}`);

const providerName = (integration, provider) => (typeof integration?.name === 'string' && integration.name ? integration.name : provider);

export function methodsFromAuthList(output) {
    const methods = new Map();
    const text = String(output).replace(/\x1b\[[0-9;]*m/g, '');
    for (const line of text.split(/\r?\n/)) {
        const fields = line.trim().split(/\s{2,}/);
        if (fields.length !== 3 || fields[2] !== 'stored') continue;
        const method = fields[1] === 'OAuth' ? 'oauth' : fields[1] === 'API key' ? 'key' : null;
        if (method) methods.set(fields[0].toLowerCase(), method);
    }
    return methods;
}

const readAuthList = (executable) => new Promise((resolve, reject) => {
    if (!executable) { reject(new Error('the OpenCode executable is unavailable')); return; }
    execFile(executable, ['auth', 'list'], { timeout: OPENCODE_LIMITS.connectMs, windowsHide: true }, (error, stdout) => {
        if (error) { reject(new Error('OpenCode could not list its sign-in methods')); return; }
        resolve(methodsFromAuthList(stdout));
    });
});

export function loginFromIntegration(integration, provider) {
    const name = providerName(integration, provider);
    const oauthLabels = (Array.isArray(integration?.methods) ? integration.methods : []).filter((method) => method?.type === 'oauth' && typeof method.label === 'string').map((method) => method.label);
    const option = oauthLabels.length ? `${name}, then ${oauthLabels.join(' or ')}` : name;
    const connections = Array.isArray(integration?.connections) ? integration.connections.filter(isRecord) : [];
    const subscription = connections.filter((entry) => entry.type === 'credential' && (entry.method === 'oauth' || entry.method === 'external'));
    const methods = [...new Set(connections.map((entry) => (entry.type === 'env' ? 'env' : entry.method)).filter(Boolean))];
    const usable = subscription.filter((entry) => entry.status?.status !== 'needs_auth');
    if (usable.length) return { state: 'ok', message: null, action: null, methods };
    if (subscription.length) {
        const first = subscription.find((entry) => entry.status?.status === 'needs_auth') ?? subscription[0];
        const reason = clip(first.status?.message, 200);
        const link = typeof first.status?.url === 'string' ? clip(first.status.url, 300) : null;
        return {
            state: 'expired',
            message: `OpenCode reports that its ${name} subscription sign-in has expired or needs renewing${reason ? ` (${reason})` : ''}: ${signInAction(option)}${link ? `. Sign-in link: ${link}` : ''}`,
            action: 'sign-in-again',
            methods,
        };
    }
    const only = methods.length ? ` Only ${methods.join(' and ')} credentials are saved, and the harness uses subscription sign-ins only.` : '';
    return { state: 'unpaired', message: `OpenCode has no ${name} subscription sign-in on this machine.${only} ${signInAction(option)}`, action: 'sign-in', methods };
}

export function classifyV2Error(error, { now = Date.now() } = {}) {
    const source = isRecord(error) ? error : {};
    const status = Number.isFinite(Number(source.status)) ? Number(source.status) : null;
    const type = typeof source.type === 'string' ? source.type : '';
    const message = clip(source.message, 400);
    const body = typeof source.response?.body === 'string' ? source.response.body.slice(0, 2000) : '';
    const evidence = `${type} ${message} ${body}`;
    const routing = /no-route|model unavailable|model not found|unknown model/i.test(evidence);
    if (status === 401 || status === 403 || /(^|\.)auth$/i.test(type) || (!routing && (AUTH_TEXT.test(evidence) || SIGN_IN_TEXT.test(`${message} ${body}`)))) {
        return { ok: false, kind: 'auth', message: `OpenCode could not authenticate with the model's provider (${message || type || 'no detail'}): ${signInAction('the routed provider')}`, signIn: true };
    }
    if (status === 429 || QUOTA_TEXT.test(evidence)) {
        const retryAt = readRetryAt(evidence, now);
        return { ok: false, kind: 'quota', message: `opencode reports its usage limit${retryAt ? ` until ${new Date(retryAt).toISOString()}` : ''}`, ...(retryAt ? { retryAt } : {}) };
    }
    if (routing) {
        return { ok: false, kind: 'config', message: `OpenCode cannot route to the model (${message || type}); check the model id and that its provider is signed in`, forget: true };
    }
    if (NETWORK_TEXT.test(evidence)) return { ok: false, kind: 'transport', message: `opencode could not reach its vendor (a proxy or CA certificate setting is a likely cause): ${message || type || 'connection failed'}`.slice(0, 400) };
    return { ok: false, kind: 'transport', message: `opencode answered with an error: ${[type, message].filter(Boolean).join(': ') || 'no detail'}`.slice(0, 400) };
}

export function describeClientError(error) {
    const tag = error?._tag ?? error?.name ?? '';
    const detail = clip(error?.message ?? error, 200);
    if (tag === 'UnauthorizedError' || tag === 'ForbiddenError') {
        return { kind: 'auth', state: 'unpaired', message: 'OpenCode\'s background service refused this plugin (its pairing is out of date or the service was replaced): in a terminal on this machine run `opencode service restart`, then retry; no login is changed' };
    }
    if (tag === 'AgentNotFoundError') return { kind: 'config', state: 'unavailable', message: 'OpenCode did not load the plugin\'s owned project config (the agent is missing), so no call was made' };
    if (tag === 'LocationNotFoundError') return { kind: 'config', state: 'unavailable', message: 'OpenCode could not open the plugin\'s owned directory' };
    if (tag === 'SessionBusyError' || tag === 'ConflictError') return { kind: 'busy', state: 'ok', message: `OpenCode reported a busy session: ${detail}` };
    if (tag === 'ServiceUnavailableError') return { kind: 'transport', state: 'unreachable', message: `OpenCode's background service is unavailable: ${detail}` };
    if (tag === 'InvalidRequestError') return { kind: 'config', state: 'unavailable', message: `OpenCode refused the request as invalid: ${detail}` };
    if (NETWORK_TEXT.test(`${detail} ${error?.cause?.code ?? ''} ${error?.cause?.message ?? ''}`) || /fetch failed|aborted/i.test(detail)) {
        return { kind: 'transport', state: 'unreachable', message: `OpenCode's background service did not answer (${detail || 'connection failed'}); \`opencode service status\` shows whether it runs` };
    }
    return { kind: 'transport', state: 'unreachable', message: `OpenCode answered with an unexpected error: ${tag ? `${tag}: ` : ''}${detail}`.slice(0, 400) };
}

const defaultLoadLibs = async () => {
    const [client, service] = await Promise.all([import('@opencode/client'), import('@opencode/client/service')]);
    return { OpenCode: client.OpenCode, Service: service.Service };
};

const MISSING_CLIENT = `the OpenCode client library (${OPENCODE_CLIENT.name} ${OPENCODE_CLIENT.version}) is not installed next to the plugin: run npm run plugins:install in the extension's repo (it installs it) and restart SillyTavern`;

export function createOpencodeTransport({
    config,
    env = process.env,
    fsImpl = fs,
    now = Date.now,
    log = () => undefined,
    loadLibs = defaultLoadLibs,
    binary = () => null,
    authMethods = readAuthList,
    nodePath = process.execPath,
    pid = process.pid,
    alive = () => false,
    version = (value) => /^2\./.test(String(value)),
    configWaitMs = OPENCODE_LIMITS.configMs,
    toolsSettleMs = OPENCODE_LIMITS.toolsSettleMs,
    connectWaitMs = OPENCODE_LIMITS.connectMs,
    waitNow = Date.now,
} = {}) {
    const entry = config.harnesses.opencode;
    const providers = [...new Set(entry.models.map((model) => splitModel(model.id)?.providerID).filter(Boolean))];
    const state = { libs: null, libsError: null, view: null, leakedSessions: 0, swept: false, calls: 0 };

    const libs = async () => {
        if (state.libs) return state.libs;
        try {
            state.libs = await loadLibs();
            if (!state.libs?.OpenCode?.make || !state.libs?.Service?.discover) throw new Error('the client library has an unexpected shape');
            return state.libs;
        } catch (error) {
            state.libsError = error;
            throw new Refused('config', error?.code === 'ERR_MODULE_NOT_FOUND' ? MISSING_CLIENT : `the OpenCode client library could not be loaded: ${clip(error?.message, 200)}`, { state: 'unavailable', service: 'unavailable' });
        }
    };

    const refusedFrom = (error) => {
        if (error instanceof Refused) return error;
        const described = describeClientError(error);
        return new Refused(described.kind, described.message, { state: described.state, service: described.state === 'unpaired' ? 'refused' : 'unreachable' });
    };

    const connect = async ({ ensure = false } = {}) => {
        const { OpenCode, Service } = await libs();
        let endpoint;
        try {
            endpoint = await Service.discover({ version });
            if (!endpoint && ensure) {
                const executable = binary();
                endpoint = await within(OPENCODE_LIMITS.startMs, Service.ensure({ version, ...(executable ? { command: [executable, 'serve', '--service'] } : {}) }), 'the background service did not start in time');
            }
        } catch (error) {
            throw new Refused('transport', `OpenCode's background service could not be reached or started: ${clip(error?.message, 200)}; run \`opencode service start\` in a terminal on this machine`, { state: 'unavailable', service: 'unreachable' });
        }
        if (!endpoint) return null;
        return OpenCode.make({ baseUrl: endpoint.url, headers: Service.headers(endpoint) });
    };

    const readIntegration = async (client, provider) => {
        try {
            return unwrap(await client.integration.get({ integrationID: provider }));
        } catch (error) {
            if (error?._tag !== 'IntegrationNotFoundError' || typeof client.integration.list !== 'function') throw error;
            const listed = unwrap(await client.integration.list().catch(() => []));
            const found = Array.isArray(listed) ? listed.find((row) => isRecord(row) && row.id === provider) : null;
            if (found) return found;
            throw error;
        }
    };

    const providerListed = async (client, provider) => {
        if (typeof client.provider?.list !== 'function') return null;
        const listed = unwrap(await client.provider.list().catch(() => null));
        if (!Array.isArray(listed)) return null;
        return listed.some((row) => isRecord(row) && (row.id === provider || row.integrationID === provider) && row.activation !== 'disabled');
    };

    const integrationLogin = async (client, provider) => {
        try {
            const integration = await readIntegration(client, provider);
            const connections = Array.isArray(integration?.connections) ? integration.connections : [];
            const incomplete = connections.some((entry) => entry?.type === 'credential' && typeof entry.method !== 'string');
            if (!incomplete) return loginFromIntegration(integration, provider);
            const methods = await authMethods(binary()).catch(() => new Map());
            const method = methods.get(provider.toLowerCase()) ?? methods.get(providerName(integration, provider).toLowerCase());
            if (method) return loginFromIntegration({ ...integration, connections: connections.map((entry) => entry?.type === 'credential' && !entry.method ? { ...entry, method } : entry) }, provider);
            const expired = connections.some((entry) => entry?.type === 'credential' && entry.status?.status === 'needs_auth');
            if (expired) return loginFromIntegration({ ...integration, connections: connections.map((entry) => entry?.type === 'credential' && !entry.method ? { ...entry, method: 'external' } : entry) }, provider);
            if (await providerListed(client, provider)) return { state: 'ok', message: null, action: null, methods: ['unidentified'], evidence: 'service-connection' };
            return { state: 'unavailable', message: `OpenCode holds a ${providerName(integration, provider)} sign-in without its method and does not list the provider as connected; check \`opencode auth list\` or update OpenCode`, action: null, methods: [] };
        } catch (error) {
            if (error?._tag === 'IntegrationNotFoundError') return { state: 'unpaired', message: `OpenCode has no ${provider} integration; ${signInAction(provider)}`, action: 'sign-in', methods: [] };
            throw refusedFrom(error);
        }
    };

    const readModels = async (client) => {
        const listed = unwrap(await client.model.list().catch((error) => { throw refusedFrom(error); }));
        const rows = new Map();
        for (const model of Array.isArray(listed) ? listed : []) {
            if (!isRecord(model) || typeof model.providerID !== 'string') continue;
            const id = typeof model.id === 'string' ? model.id : model.modelID;
            rows.set(`${model.providerID}/${id}`, {
                available: model.enabled !== false,
                image: Array.isArray(model.capabilities?.input) ? model.capabilities.input.includes('image') : null,
                variants: Array.isArray(model.variants) ? model.variants.map((variant) => variant?.id).filter((variantId) => typeof variantId === 'string') : [],
                context: Number.isInteger(model.limit?.context) ? model.limit.context : null,
            });
        }
        return rows;
    };

    const inspect = async ({ ensure = false, force = false } = {}) => {
        const cached = state.view;
        if (cached && !force && now() - cached.at < OPENCODE_LIMITS.statusTtlMs && (cached.service === 'running' || !ensure)) return cached;
        const base = { at: now(), client: 'ready', service: 'stopped', serviceVersion: null, logins: {}, models: new Map(), problem: null, handle: null };
        try {
            const client = await connect({ ensure });
            if (!client) {
                state.view = { ...base, logins: Object.fromEntries(providers.map((provider) => [provider, { state: 'unchecked', message: 'OpenCode\'s background service is not running; it starts with the first call and the sign-in is checked then', action: null, methods: [] }])) };
                return state.view;
            }
            const info = unwrap(await client.server.info().catch((error) => { throw refusedFrom(error); }));
            const models = await readModels(client);
            const logins = {};
            for (const provider of providers) logins[provider] = await integrationLogin(client, provider);
            state.view = { ...base, service: 'running', serviceVersion: typeof info?.version === 'string' ? info.version : null, logins, models, handle: client };
        } catch (error) {
            const refused = refusedFrom(error);
            state.view = { ...base, client: refused.service === 'unavailable' && state.libsError ? 'missing' : 'ready', service: refused.service ?? 'unreachable', problem: refused.message, problemKind: refused.kind, problemState: refused.state };
        }
        return state.view;
    };

    const forget = () => { state.view = null; };

    const ready = async (model, { ensure = true, images } = {}) => {
        const view = await inspect({ ensure });
        if (view.problem) return { ok: false, kind: view.problemKind ?? 'transport', message: view.problem };
        if (view.service !== 'running') return { ok: false, kind: 'transport', message: 'OpenCode\'s background service is not running' };
        const split = splitModel(model);
        if (!split) return { ok: false, kind: 'config', message: `the model ${clip(model, 60)} is not provider/model` };
        const login = view.logins[split.providerID];
        if (login && login.state !== 'ok') return { ok: false, kind: 'auth', message: login.message, loginState: login.state };
        const row = view.models.get(`${split.providerID}/${split.id}`);
        if (!row || !row.available) return { ok: false, kind: 'config', message: `OpenCode does not list the model ${model} as available on this machine` };
        const imaged = prepareImages(images, { image: row.image !== false });
        if (imaged.issue) return { ok: false, kind: imaged.issue.includes('no image input') ? 'config' : 'refused', message: imaged.issue };
        return { ok: true, view, client: view.handle, split, row };
    };

    const locationFor = (directory) => ({ directory: path.resolve(directory) });

    const writePrivate = (file, text) => {
        fsImpl.writeFileSync(file, text, { encoding: 'utf-8', mode: 0o600 });
        try { fsImpl.chmodSync(file, 0o600); } catch { return; }
    };

    const textDirectory = (system) => {
        const dir = path.join(config.tmpRoot, 'opencode-loc', `text-${digest(system).slice(0, 16)}`);
        const file = path.join(dir, 'opencode.json');
        if (!fsImpl.existsSync(file)) {
            fsImpl.mkdirSync(dir, { recursive: true });
            fsImpl.writeFileSync(file, textConfig(system), 'utf-8');
        }
        return dir;
    };

    const verifyAgent = async (client, directory, agentId, check) => {
        let agent;
        let until = null;
        for (;;) {
            try {
                agent = unwrap(await client.agent.get({ agentID: agentId, location: locationFor(directory) }));
                break;
            } catch (error) {
                until ??= waitNow() + configWaitMs;
                if (error?._tag !== 'AgentNotFoundError' || waitNow() >= until) throw refusedFrom(error);
                await sleep(100);
            }
        }
        if (!isRecord(agent) || !Array.isArray(agent.permissions) || !check(agent.permissions)) {
            throw new Refused('refused', `OpenCode's effective permissions for ${agentId} do not keep every tool off, so no call was made`, { state: 'unavailable' });
        }
        return agent;
    };

    const mcpConnected = async (client, directory, { until, connectBy }, signal, shimSeen = null) => {
        const location = locationFor(directory);
        for (;;) {
            let listed = [];
            try {
                listed = unwrap(await client.mcp.list({ location }));
            } catch (error) {
                throw refusedFrom(error);
            }
            const server = (Array.isArray(listed) ? listed : []).find((row) => row?.name === BRIDGE_SERVER);
            const status = server?.status?.status;
            if (status === 'connected') return;
            if (status === 'failed' || status === 'needs_auth' || status === 'disabled') {
                throw new Refused('config', `OpenCode could not connect the wizard's tool server (${status}${server.status.error ? `: ${clip(server.status.error, 200)}` : ''})`, { state: 'unavailable' });
            }
            if (signal?.aborted) throw new Refused('lapsed', 'the request was cancelled');
            if (Date.now() >= until || waitNow() >= connectBy) throw new Refused('timeout', `OpenCode did not connect the wizard's tool server before the deadline${shimSeen ? (shimSeen() ? ' (its process reached the bridge, so OpenCode never reported the connection)' : ' (its process never reached the bridge: OpenCode did not start it in time)') : ''}`, { state: 'unavailable' });
            await sleep(100);
        }
    };

    const evict = async (client, directory) => {
        try {
            await within(OPENCODE_LIMITS.stopMs, client.debug.location.evict({ location: locationFor(directory) }), 'evict stalled');
        } catch {
            return;
        }
    };

    const watchEvents = (client, signal, onEvent) => {
        let connectedSeen;
        const connected = new Promise((resolve) => { connectedSeen = resolve; });
        const lost = { value: false };
        void (async () => {
            try {
                for await (const event of client.event.subscribe({ signal })) {
                    if (isRecord(event) && event.type === 'server.connected') connectedSeen();
                    try { onEvent(event); } catch { continue; }
                }
            } catch {
                lost.value = !signal.aborted;
            }
            lost.value = lost.value || !signal.aborted;
            connectedSeen();
        })();
        return { connected, lost };
    };

    const readMessages = async (client, sessionID) => {
        const all = [];
        let cursor;
        for (let page = 0; page < OPENCODE_LIMITS.maxMessagePages; page += 1) {
            const answer = await client.message.list({ sessionID, order: 'asc', limit: OPENCODE_LIMITS.pageSize, ...(cursor ? { cursor } : {}) });
            const rows = Array.isArray(answer?.data) ? answer.data : [];
            all.push(...rows.filter(isRecord));
            cursor = answer?.cursor?.next ?? undefined;
            if (rows.length < OPENCODE_LIMITS.pageSize || !cursor) break;
        }
        return all;
    };

    const isIdle = (messages) => messages.length > 0 && messages[messages.length - 1].type === 'idle' && messages.some((message) => message.type === 'user');

    const summarize = (messages, allowedTool) => {
        const assistants = messages.filter((message) => message.type === 'assistant');
        const parts = assistants.flatMap((message) => (Array.isArray(message.content) ? message.content.filter(isRecord) : []));
        const text = parts.filter((part) => part.type === 'text').map((part) => (typeof part.text === 'string' ? part.text : '')).join('');
        const foreign = parts.filter((part) => part.type === 'tool' && !allowedTool(String(part.name ?? ''))).map((part) => String(part.name ?? ''));
        const idle = [...messages].reverse().find((message) => message.type === 'idle');
        const last = assistants[assistants.length - 1];
        const tokens = assistants.map((message) => message.tokens).filter(isRecord);
        const costs = assistants.map((message) => message.cost).filter((cost) => typeof cost === 'number');
        const served = isRecord(last?.model) && typeof last.model.providerID === 'string' && typeof last.model.id === 'string' ? `${last.model.providerID}/${last.model.id}` : null;
        return {
            text,
            model: served,
            foreign,
            outcome: idle?.outcome ?? null,
            error: idle?.error ?? assistants.map((message) => message.error).filter(isRecord).pop() ?? null,
            finish: typeof last?.finish === 'string' ? last.finish : null,
            usage: tokens.length ? {
                input: tokens.reduce((sum, row) => sum + (row.input ?? 0) + (row.cache?.read ?? 0), 0),
                output: tokens.reduce((sum, row) => sum + (row.output ?? 0), 0),
                costUsd: costs.length ? costs.reduce((sum, cost) => sum + cost, 0) : null,
            } : null,
        };
    };

    const FINISH = { stop: 'stop', length: 'length' };

    const interruptAndWait = async (client, sessionID) => {
        const until = Date.now() + OPENCODE_LIMITS.stopMs;
        try { await within(OPENCODE_LIMITS.stopMs, client.session.interrupt({ sessionID }), 'interrupt stalled'); } catch { return false; }
        while (Date.now() < until) {
            try {
                const active = await within(until - Date.now(), client.session.active(), 'active stalled');
                if (!isRecord(unwrap(active)) || !(sessionID in unwrap(active))) return true;
            } catch {
                return false;
            }
            await sleep(100);
        }
        return false;
    };

    const removeSession = (client, sessionID) => Promise.resolve().then(() => client.session.remove({ sessionID })).then(() => true, (error) => {
        if (error?._tag !== 'SessionNotFoundError') {
            state.leakedSessions += 1;
            log(JSON.stringify({ harness: 'opencode', leakedSession: true }));
        }
        return false;
    });

    const removeLate = (client, late) => (isRecord(late) && typeof late.id === 'string' ? removeSession(client, late.id) : undefined);

    const runSession = async (client, spec) => {
        const control = new AbortController();
        const track = { sessionID: null, streamed: 0, foreign: null, asked: null, fatal: null, retries: 0, terminal: null };
        const allowed = spec.allowedTool ?? (() => false);
        let finish;
        const finished = new Promise((resolve) => { finish = (value) => resolve(value); });
        const settle = (value) => finish(value);
        const onEvent = (event) => {
            if (!isRecord(event) || typeof event.type !== 'string' || !isRecord(event.data) || event.data.sessionID !== track.sessionID) return;
            const { type, data } = event;
            if (TERMINAL.has(type)) {
                track.terminal = { type, error: isRecord(data.error) ? data.error : null, reason: data.reason ?? null };
                settle({ type: 'terminal' });
            } else if (type === 'permission.asked') {
                track.asked = { action: clip(data.action, 80), id: data.id };
                settle({ type: 'permission' });
            } else if (type === 'session.tool.input.started' && typeof data.name === 'string' && !allowed(data.name)) {
                track.foreign = data.name;
                settle({ type: 'foreign' });
            } else if (type === 'session.text.delta' && typeof data.delta === 'string') {
                track.streamed += data.delta.length;
                if (spec.maxOutputChars && track.streamed > spec.maxOutputChars * 2 + 4096) settle({ type: 'bound' });
            } else if (type === 'session.status' || type === 'session.retry.scheduled') {
                const status = isRecord(data.status) ? data.status : data;
                const retry = type === 'session.retry.scheduled' ? { type: 'retry', ...data } : status;
                if (retry.type === 'retry') {
                    track.retries += 1;
                    if (isRecord(retry.action)) track.fatal = { ok: false, kind: 'auth', message: `OpenCode asks for the owner's action: ${clip(retry.action.message ?? retry.action.title, 200)}${retry.action.link ? ` (${clip(retry.action.link, 300)})` : ''}; ${LOGIN_ACTION}`, signIn: true };
                    else {
                        const classified = classifyV2Error({ ...(isRecord(retry.error) ? retry.error : {}), message: retry.message ?? retry.error?.message }, { now: now() });
                        if (classified.kind === 'auth' || classified.kind === 'quota') track.fatal = classified;
                        else if (track.retries > OPENCODE_LIMITS.maxRetries) track.fatal = { ok: false, kind: 'transport', message: `opencode kept retrying and gave up: ${clip(retry.message ?? retry.error?.message, 200)}` };
                    }
                    if (track.fatal) settle({ type: 'fatal' });
                }
            }
        };

        if (spec.signal?.aborted) return { ok: false, kind: 'lapsed', message: 'the request was cancelled' };
        const until = spec.until ?? Date.now() + Math.max(0, spec.deadlineMs - (now() - spec.startedAt));
        const left = () => until - Date.now();
        const timers = [setTimeout(() => settle({ type: 'timeout' }), Math.max(0, left()))];
        const onAbort = () => settle({ type: 'cancelled' });
        spec.signal?.addEventListener('abort', onAbort);
        const watcher = watchEvents(client, control.signal, onEvent);
        let session = null;
        try {
            await within(Math.min(OPENCODE_LIMITS.subscribeMs, left()), watcher.connected, 'no event stream', spec.signal).catch(() => undefined);
            const creating = Promise.resolve().then(() => client.session.create({
                agent: spec.agent,
                model: spec.model,
                location: locationFor(spec.directory),
                title: `${SESSION_TITLE} ${pid} ${spec.label}`,
                metadata: { owner: SESSION_OWNER, pid, label: spec.label },
                permissions: spec.rules,
            }));
            try {
                session = unwrap(await within(left(), creating, lapse, spec.signal));
            } catch (error) {
                if (stalled(error)) void creating.then((late) => removeLate(client, unwrap(late)), () => undefined);
                throw error;
            }
            if (!isRecord(session) || typeof session.id !== 'string') throw new Refused('malformed', 'OpenCode answered the session request without a session');
            if (session.agent !== spec.agent || !Array.isArray(session.permissions) || !spec.check(session.permissions)) {
                throw new Refused('refused', 'OpenCode did not keep the requested agent and permissions on the session; no call was made', { state: 'unavailable' });
            }
            track.sessionID = session.id;
            await within(left(), Promise.resolve().then(() => client.session.prompt({ sessionID: session.id, text: spec.prompt, ...(spec.files?.length ? { files: spec.files } : {}) })), lapse, spec.signal);
            const admittedMs = now();
            let polling = false;
            const poll = async () => {
                if (polling) return;
                polling = true;
                try {
                    const messages = await readMessages(client, session.id);
                    if (isIdle(messages)) settle({ type: 'terminal' });
                } catch (error) {
                    if (error?._tag === 'SessionNotFoundError') settle({ type: 'vanished' });
                } finally {
                    polling = false;
                }
            };
            const interval = setInterval(() => { void poll(); }, OPENCODE_LIMITS.pollMs);
            timers.push(interval);
            const result = await finished;
            if (result.type === 'timeout') {
                await interruptAndWait(client, session.id);
                return { ok: false, kind: 'timeout', message: 'opencode did not answer before the deadline; its session was interrupted and removed', ms: now() - spec.startedAt, admittedMs };
            }
            if (result.type === 'cancelled') {
                await interruptAndWait(client, session.id);
                return { ok: false, kind: 'lapsed', message: 'the request was cancelled' };
            }
            if (result.type === 'vanished') return { ok: false, kind: 'lapsed', message: 'the OpenCode session disappeared while it ran' };
            if (result.type === 'foreign' || result.type === 'permission') {
                if (track.asked) await client.permission.reply({ sessionID: session.id, requestID: track.asked.id, decision: 'reject' }).catch(() => undefined);
                await interruptAndWait(client, session.id);
                spec.onForeign?.(track.foreign ?? track.asked?.action ?? 'permission');
                return { ok: false, kind: 'refused', message: `opencode attempted ${track.foreign ? `a tool call (${clip(track.foreign, 40)})` : `a permission request (${track.asked.action})`} outside what this call allows; the answer is discarded`, foreign: true };
            }
            if (result.type === 'fatal') {
                await interruptAndWait(client, session.id);
                const { signIn, forget: dropView, ...fatal } = track.fatal;
                if (signIn || dropView) forget();
                return fatal;
            }
            let messages = [];
            let summary = null;
            for (let tries = 0; tries < OPENCODE_LIMITS.messageSettleTries; tries += 1) {
                messages = await within(Math.max(0, left()) + OPENCODE_LIMITS.stopMs, readMessages(client, session.id), lapse, spec.signal);
                if (result.type === 'bound' || isIdle(messages)) break;
                await sleep(150);
            }
            summary = summarize(messages, allowed);
            if (result.type === 'bound') {
                await interruptAndWait(client, session.id);
                const streamed = summarize(await readMessages(client, session.id).catch(() => messages), allowed);
                const text = streamed.text.slice(0, spec.maxOutputChars);
                return text ? { ok: true, text, finish: 'length', usage: streamed.usage } : { ok: false, kind: 'malformed', message: 'opencode output passed its bound before a reply could be read' };
            }
            if (summary.foreign.length) {
                spec.onForeign?.(summary.foreign[0]);
                return { ok: false, kind: 'refused', message: `opencode attempted ${summary.foreign.length} tool call(s) outside what this call allows; the answer is discarded`, foreign: true };
            }
            const failure = track.terminal?.error ?? summary.error;
            if (track.terminal?.type === 'session.execution.interrupted' || (!failure && summary.outcome === 'interrupted')) {
                const reason = track.terminal?.reason ?? 'interrupted';
                return reason === 'user' ? { ok: false, kind: 'lapsed', message: 'the request was cancelled' } : { ok: false, kind: 'transport', message: `OpenCode stopped the session (${clip(reason, 40)})` };
            }
            if (failure || track.terminal?.type === 'session.execution.failed' || summary.outcome === 'failed') {
                const { signIn, forget: dropView, ...classified } = classifyV2Error(failure ?? { type: 'execution.failed', message: 'the session failed without a detail' }, { now: now() });
                if (signIn || dropView) forget();
                return classified;
            }
            if (summary.finish === 'content-filter') return { ok: false, kind: 'refused', message: 'the model\'s content filter stopped the answer' };
            if (!summary.text.trim()) return { ok: false, kind: 'malformed', message: messages.length ? 'opencode answered with no text' : 'opencode answered without readable messages' };
            const cut = spec.maxOutputChars && summary.text.length > spec.maxOutputChars;
            return { ok: true, text: cut ? summary.text.slice(0, spec.maxOutputChars) : summary.text, finish: cut ? 'length' : (FINISH[summary.finish] ?? 'unknown'), usage: summary.usage, model: summary.model, admittedMs };
        } catch (error) {
            const refused = refusedFrom(error);
            if (refused.forget || refused.state === 'unpaired') forget();
            if (stalled(refused) && session?.id) await interruptAndWait(client, session.id);
            return { ok: false, kind: refused.kind, message: refused.message };
        } finally {
            spec.signal?.removeEventListener('abort', onAbort);
            for (const timer of timers) { clearTimeout(timer); clearInterval(timer); }
            control.abort();
            if (isRecord(session) && typeof session.id === 'string') await within(OPENCODE_LIMITS.stopMs, removeSession(client, session.id), 'remove stalled').catch(() => undefined);
        }
    };

    const withEffort = (row, split, effort) => {
        const variant = typeof effort === 'string' && row.variants.includes(effort) ? effort : null;
        return { model: { providerID: split.providerID, id: split.id, ...(variant ? { variant } : {}) }, applied: Boolean(variant) };
    };

    const complete = async (request, { signal = null, deadlineMs, startedAt = now(), user = 'default-user' } = {}) => {
        state.calls += 1;
        if (signal?.aborted) return { ok: false, kind: 'lapsed', message: 'the request was cancelled' };
        const until = Date.now() + Math.max(0, deadlineMs - (now() - startedAt));
        let checked;
        try {
            checked = await within(until - Date.now(), ready(request.model, { images: request.images }), lapse, signal);
        } catch (error) {
            return { ok: false, kind: refusedFrom(error).kind, message: refusedFrom(error).message };
        }
        if (!checked.ok) return checked;
        const imaged = prepareImages(request.images);
        let directory;
        try {
            directory = textDirectory(request.system);
        } catch (error) {
            return { ok: false, kind: 'config', message: `the plugin could not prepare its owned directory (${error?.code ?? error?.message ?? 'error'})` };
        }
        const effort = withEffort(checked.row, checked.split, request.effort);
        let setupMs = null;
        try {
            await within(until - Date.now(), verifyAgent(checked.client, directory, TEXT_AGENT, toolsDenied), lapse, signal);
        } catch (error) {
            return { ok: false, kind: refusedFrom(error).kind, message: refusedFrom(error).message };
        }
        const outcome = await runSession(checked.client, {
            until,
            agent: TEXT_AGENT,
            directory,
            rules: textRules(),
            check: toolsDenied,
            model: effort.model,
            prompt: request.prompt,
            files: imaged.files,
            deadlineMs,
            startedAt,
            maxOutputChars: request.maxOutputChars,
            signal,
            label: `${user}/${request.role}`,
            allowedTool: () => false,
        });
        if (outcome.admittedMs) setupMs = outcome.admittedMs - startedAt;
        const { admittedMs, ...rest } = outcome;
        return { ...rest, effortApplied: effort.applied, spawnMs: setupMs };
    };

    const runAgent = async ({ request, owned, pipe, secret, toolsFile, signal, onForeign, deadlineMs, shimConnected = null }) => {
        const startedAt = now();
        const until = Date.now() + Math.max(0, deadlineMs);
        let checked;
        try {
            checked = await within(until - Date.now(), ready(request.model, { images: request.images }), lapse, signal);
        } catch (error) {
            return { ok: false, kind: refusedFrom(error).kind, message: refusedFrom(error).message };
        }
        if (!checked.ok) return checked;
        const imaged = prepareImages(request.images);
        const names = new Set(request.tools.map((tool) => `${BRIDGE_SERVER}_${tool.name}`));
        const effort = withEffort(checked.row, checked.split, request.effort);
        try {
            writePrivate(path.join(owned.cwd, 'opencode.json'), bridgeConfig({ system: request.system, nodePath, pipe, secret, toolsFile, callTimeoutMs: request.callTimeoutMs }));
            await within(until - Date.now(), verifyAgent(checked.client, owned.cwd, BRIDGE_AGENT, (rules) => bridgeOnly(rules, request.tools.map((tool) => tool.name))), lapse, signal);
            const connectBy = waitNow() + connectWaitMs;
            await within(until - Date.now(), mcpConnected(checked.client, owned.cwd, { until, connectBy }, signal, shimConnected), lapse, signal);
            await within(until - Date.now(), sleep(toolsSettleMs), lapse, signal);
        } catch (error) {
            await evict(checked.client, owned.cwd);
            const refused = error instanceof Refused ? error : new Refused('config', `the plugin could not prepare the wizard's session (${error?.code ?? error?.message ?? 'error'})`);
            return { ok: false, kind: refused.kind, message: refused.message };
        }
        try {
            return await runSession(checked.client, {
                until,
                agent: BRIDGE_AGENT,
                directory: owned.cwd,
                rules: bridgeRules(),
                check: (rules) => bridgeOnly(rules, request.tools.map((tool) => tool.name)),
                model: effort.model,
                prompt: request.prompt,
                files: imaged.files,
                deadlineMs,
                startedAt,
                maxOutputChars: request.maxOutputChars,
                signal,
                label: `${owned.label ?? 'agent'}`,
                allowedTool: (name) => names.has(name),
                onForeign,
            });
        } finally {
            await evict(checked.client, owned.cwd);
        }
    };

    const sweepLocations = () => {
        const root = path.join(config.tmpRoot, 'opencode-loc');
        let removed = 0;
        let names = [];
        try { names = fsImpl.readdirSync(root); } catch { return { removed }; }
        for (const name of names) {
            const dir = path.join(root, name);
            try {
                if (now() - fsImpl.statSync(path.join(dir, 'opencode.json')).mtimeMs <= OPENCODE_LIMITS.locationStaleMs) continue;
                fsImpl.rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
                removed += 1;
            } catch {
                continue;
            }
        }
        return { removed };
    };

    const sweepSessions = async () => {
        sweepLocations();
        if (state.swept) return { removed: 0 };
        state.swept = true;
        let removed = 0;
        try {
            const client = await connect();
            if (!client) return { removed };
            const listed = unwrap(await client.session.list({ search: SESSION_TITLE, limit: 100 }));
            for (const row of Array.isArray(listed) ? listed : []) {
                if (!isRecord(row) || row.metadata?.owner !== SESSION_OWNER) continue;
                const owner = row.metadata?.pid;
                if (owner === pid || (Number.isInteger(owner) && alive(owner))) continue;
                try {
                    await client.session.remove({ sessionID: row.id });
                    removed += 1;
                } catch {
                    continue;
                }
            }
        } catch {
            return { removed };
        }
        if (removed) log(JSON.stringify({ harness: 'opencode', sweptSessions: removed }));
        return { removed };
    };

    return { inspect, ready, complete, runAgent, sweepSessions, sweepLocations, forget, state, providers, internals: { textDirectory, verifyAgent, mcpConnected, evict, runSession } };
}

