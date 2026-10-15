import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const isRecord = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const failure = (tag, message = tag) => Object.assign(new Error(message), { _tag: tag, name: tag });

const wildcard = (pattern) => new RegExp(`^${pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*')}$`, 'i');
const effectOf = (rules, action) => rules.reduce((effect, rule) => (wildcard(rule.action).test(action) ? rule.effect : effect), 'ask');

const BASE_RULES = [
    { action: '*', resource: '*', effect: 'allow' },
    { action: 'external_directory', resource: '*', effect: 'ask' },
    { action: 'read', resource: '*.env', effect: 'ask' },
];

export const FAKE_MODELS = Object.freeze([
    { id: 'gpt-6.1-sol', modelID: 'gpt-6.1-sol', providerID: 'openai', capabilities: { tools: true, input: ['text', 'image'], output: ['text'] }, variants: [{ id: 'low' }, { id: 'medium' }, { id: 'high' }], limit: { context: 400_000, input: 272_000, output: 128_000 }, enabled: true },
    { id: 'gpt-6-luna', modelID: 'gpt-6-luna', providerID: 'openai', capabilities: { tools: true, input: ['text'], output: ['text'] }, variants: [], limit: { context: 128_000 }, enabled: true },
]);

const CONNECTIONS = {
    ok: [{ type: 'credential', id: 'cred_synthetic', label: 'synthetic account', method: 'oauth' }],
    expired: [{ type: 'credential', id: 'cred_synthetic', label: 'synthetic account', method: 'oauth', status: { status: 'needs_auth', message: 'the refresh token was rejected', url: 'https://login.example.test/renew' } }],
    none: [],
    key: [{ type: 'credential', id: 'cred_key', label: 'synthetic key', method: 'key' }],
    env: [{ type: 'env', name: 'OPENAI_API_KEY' }],
    methodless: [{ type: 'credential', id: 'cred_synthetic', label: 'synthetic account' }],
    'methodless-expired': [{ type: 'credential', id: 'cred_synthetic', label: 'synthetic account', status: { status: 'needs_auth', message: 'the refresh token was rejected' } }],
    cold: [{ type: 'credential', id: 'cred_synthetic', label: 'synthetic account' }],
};

const integrationRow = (integrationID, login) => ({ id: integrationID, name: 'OpenAI', methods: [{ type: 'key' }, { id: 'chatgpt-browser', type: 'oauth', label: 'ChatGPT Pro/Plus (browser)' }], connections: CONNECTIONS[login] ?? [] });

const startMcp = (server) => {
    const child = spawn(server.command[0], server.command.slice(1), { env: { ...process.env, ...(server.environment ?? {}) }, stdio: ['pipe', 'pipe', 'ignore'], windowsHide: true });
    const pending = new Map();
    let buffer = '';
    let next = 1;
    let exited = false;
    child.on('error', () => { exited = true; });
    child.on('close', () => { exited = true; for (const resolve of pending.values()) resolve({ error: { message: 'closed' } }); pending.clear(); });
    child.stdout.on('data', (chunk) => {
        buffer += chunk.toString('utf8');
        let at;
        while ((at = buffer.indexOf('\n')) >= 0) {
            const line = buffer.slice(0, at);
            buffer = buffer.slice(at + 1);
            try {
                const message = JSON.parse(line);
                pending.get(message.id)?.(message);
                pending.delete(message.id);
            } catch { /* not a JSON-RPC line */ }
        }
    });
    const request = (method, params) => new Promise((resolve) => {
        if (exited) return resolve({ error: { message: 'exited' } });
        const id = next;
        next += 1;
        pending.set(id, resolve);
        child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`);
        return undefined;
    });
    const notify = (method) => child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', method })}\n`);
    return { request, notify, child, alive: () => !exited };
};

export function createFakeOpencode({ login = 'ok', up = true, version = '2.0.6', models = FAKE_MODELS, mcpDelayMs = 0, serviceStartFails = false, ...flags } = {}) {
    const state = {
        up, login, version, models: [...models],
        refuseAuth: false, unreachable: false, eventsDisabled: false, eventsBreakAfter: null, noMessages: false,
        mcpPids: [], mcpDelayMs, mcpFail: false, mcpPending: false, serviceStartFails, ignoreProjectConfig: false, dropPermissions: false,
        discoverCalls: 0, ensureCalls: [], created: [], prompts: [], removed: [], interrupts: [], evicted: [], replies: [], listCalls: 0,
        running: 0, peak: 0, removeFails: false,
        sessions: new Map(), locations: new Map(), subscribers: new Set(), nextId: 1,
        ...flags,
        stall: new Set(flags.stall ?? []), held: [],
    };

    const hold = async (name) => {
        if (state.stall.has(name)) await new Promise((resolve) => state.held.push(resolve));
    };
    const release = () => {
        state.stall.clear();
        for (const resolve of state.held.splice(0)) resolve();
    };

    const check = () => {
        if (state.unreachable) throw Object.assign(new TypeError('fetch failed'), { cause: { code: 'ECONNREFUSED' } });
        if (state.refuseAuth) throw failure('UnauthorizedError', 'unauthorized');
    };

    const emit = (type, data) => {
        const event = { id: `evt_${state.nextId++}`, created: Date.now(), type, location: undefined, data };
        for (const subscriber of state.subscribers) subscriber.push(event);
    };

    const readConfig = (directory) => {
        if (state.ignoreProjectConfig) return {};
        try {
            return JSON.parse(fs.readFileSync(path.join(directory, 'opencode.json'), 'utf8'));
        } catch {
            return {};
        }
    };

    const bootLocation = (directory) => {
        const key = path.resolve(directory);
        let location = state.locations.get(key);
        if (location) return location;
        const config = readConfig(key);
        location = { key, config, servers: new Map(), bootedAt: Date.now() };
        state.locations.set(key, location);
        for (const [name, server] of Object.entries(config.mcp?.servers ?? {})) {
            if (server.disabled || server.type !== 'local') continue;
            const row = { name, status: { status: 'pending' }, tools: [], client: null };
            location.servers.set(name, row);
            void (async () => {
                if (state.mcpDelayMs) await sleep(state.mcpDelayMs);
                if (state.mcpFail) { row.status = { status: 'failed', error: 'the stdio server exited' }; return; }
                if (state.mcpPending) return;
                try {
                    row.client = startMcp(server);
                    state.mcpPids.push(row.client.child.pid);
                    const init = await row.client.request('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'fake-opencode', version: '0' } });
                    if (init.error) throw new Error(init.error.message);
                    row.client.notify('notifications/initialized');
                    row.tools = (await row.client.request('tools/list', {})).result?.tools ?? [];
                    row.codemode = server.codemode;
                    row.status = { status: 'connected' };
                } catch (error) {
                    row.status = { status: 'failed', error: String(error?.message ?? error) };
                }
            })();
        }
        return location;
    };

    const agentRules = (location, agentId) => {
        const agent = location.config.agents?.[agentId];
        return agent ? [...BASE_RULES, ...(state.dropPermissions ? [] : (agent.permissions ?? []))] : null;
    };

    const finishSession = (session, outcome, error = null) => {
        const idle = { id: `msg_${state.nextId++}`, type: 'idle', time: { created: Date.now() }, outcome, ...(error ? { error } : {}) };
        session.messages.push(idle);
        session.outcome = outcome;
        if (session.running) state.running -= 1;
        session.running = false;
        if (outcome === 'succeeded') emit('session.execution.succeeded', { sessionID: session.id });
        else if (outcome === 'failed') emit('session.execution.failed', { sessionID: session.id, error: error ?? { type: 'unknown', message: 'failed' } });
        else emit('session.execution.interrupted', { sessionID: session.id, reason: 'user' });
        session.settle?.();
    };

    const run = async (session, text, files) => {
        session.running = true;
        state.running += 1;
        state.peak = Math.max(state.peak, state.running);
        const marker = text.indexOf('FAKE:');
        const script = marker >= 0 ? JSON.parse(text.slice(marker + 5).trim().split('\n')[0]) : [{ say: 'PONG' }];
        emit('session.execution.started', { sessionID: session.id });
        const location = bootLocation(session.location.directory);
        const rules = agentRules(location, session.agent) ?? [];
        const assistant = { id: `msg_${state.nextId++}`, type: 'assistant', time: { created: Date.now() }, agent: session.agent, model: state.servedModel ?? session.model, content: [], finish: 'stop', cost: 0.01, tokens: { input: 100, output: 10, reasoning: 0, cache: { read: 0, write: 0 } } };
        session.messages.push(assistant);
        const said = [];
        const hung = new Promise((resolve) => { session.interrupt = resolve; });
        const ended = (outcome, error) => { assistant.content = said.length ? [{ type: 'text', text: said.join('\n') }, ...assistant.content] : assistant.content; finishSession(session, outcome, error); };
        const server = [...location.servers.values()][0];
        const exposed = server ? server.tools.map((tool) => `${[...location.servers.keys()][0]}_${tool.name}`).filter((name) => effectOf(rules, name) === 'allow') : [];
        const toolCall = async (tool, args) => {
            const name = `so_${tool}`;
            emit('session.tool.input.started', { sessionID: session.id, assistantMessageID: assistant.id, id: `call_${state.nextId++}`, name });
            assistant.content.push({ type: 'tool', id: `call_${state.nextId}`, name, state: { status: 'completed' }, time: { created: Date.now() } });
            if (!exposed.includes(name)) return { ok: false, text: `tool ${name} is not available` };
            const answer = await server.client.request('tools/call', { name: tool, arguments: args });
            return { ok: !(answer.result?.isError ?? answer.error), text: answer.result?.content?.[0]?.text ?? answer.error?.message ?? '' };
        };
        try {
            for (const step of script) {
                if (session.interrupted) return ended('interrupted');
                if (step.delay) await Promise.race([sleep(step.delay), hung]);
                if (step.list) said.push(JSON.stringify({ exposed, servers: [...location.servers.entries()].map(([name, row]) => ({ name, codemode: row.codemode })), files: files.map((file) => file.uri.slice(0, 30)) }));
                if (step.say !== undefined) { said.push(step.say); emit('session.text.delta', { sessionID: session.id, assistantMessageID: assistant.id, ordinal: 0, delta: step.say }); }
                if (step.stream) {
                    for (let index = 0; index < step.stream && !session.interrupted; index += 1) {
                        emit('session.text.delta', { sessionID: session.id, assistantMessageID: assistant.id, ordinal: 0, delta: 'x'.repeat(1000) });
                        said.length = 0;
                        said.push('x'.repeat((index + 1) * 1000));
                        await sleep(2);
                    }
                    if (session.interrupted) return ended('interrupted');
                }
                if (step.call) {
                    const answer = await toolCall(step.call, step.args ?? {});
                    said.push(`${step.call}:${answer.ok ? 'ok' : 'error'}:${answer.text}`);
                }
                if (step.burst) {
                    const answers = await Promise.all(Array.from({ length: step.burst }, () => toolCall(step.tool, {})));
                    for (const answer of answers) said.push(`burst:${answer.ok ? 'ok' : 'error'}:${answer.text}`);
                }
                if (step.foreign) {
                    emit('session.tool.input.started', { sessionID: session.id, assistantMessageID: assistant.id, id: `call_${state.nextId++}`, name: step.foreign });
                    assistant.content.push({ type: 'tool', id: `call_${state.nextId}`, name: step.foreign, state: { status: 'running' }, time: { created: Date.now() } });
                    if (step.silent) state.subscribers.forEach((subscriber) => subscriber.drop?.());
                }
                if (step.permission) emit('permission.asked', { id: 'perm_1', sessionID: session.id, action: step.permission, resources: ['*'] });
                if (step.retry) emit('session.status', { sessionID: session.id, status: { type: 'retry', attempt: 1, message: step.retry.message ?? 'retrying', next: Date.now() + 1000, ...(step.retry.action ? { action: step.retry.action } : {}) } });
                if (step.malformed) for (const event of [null, 'text', {}, { type: 5 }, { type: 'session.text.delta' }, { type: 'session.execution.failed', data: null }]) for (const subscriber of state.subscribers) subscriber.push(event);
                if (step.hang) await hung;
                if (step.fail) {
                    assistant.error = step.fail;
                    assistant.finish = 'error';
                    return ended('failed', step.fail);
                }
                if (step.noText) said.length = 0;
                if (step.finish) assistant.finish = step.finish;
            }
            if (session.interrupted) return ended('interrupted');
            return ended('succeeded');
        } catch (error) {
            return ended('failed', { type: 'unknown', message: String(error?.message ?? error) });
        }
    };

    const events = (options = {}) => ({
        [Symbol.asyncIterator]() {
            const queue = [];
            let wake = null;
            let ended = false;
            let delivered = 0;
            const subscriber = { push: (event) => { queue.push(event); wake?.(); }, drop: () => { ended = true; wake?.(); } };
            const stop = () => { ended = true; state.subscribers.delete(subscriber); wake?.(); };
            options.signal?.addEventListener('abort', stop);
            if (!state.eventsDisabled) {
                state.subscribers.add(subscriber);
                queue.push({ id: 'evt_connected', created: Date.now(), type: 'server.connected', data: {} });
            }
            return {
                async next() {
                    for (;;) {
                        if (state.eventsBreakAfter !== null && delivered >= state.eventsBreakAfter) { state.subscribers.delete(subscriber); throw new Error('event stream broke'); }
                        if (queue.length) { delivered += 1; return { value: queue.shift(), done: false }; }
                        if (ended || options.signal?.aborted) { state.subscribers.delete(subscriber); return { value: undefined, done: true }; }
                        await new Promise((resolve) => { wake = resolve; });
                    }
                },
                async return() { stop(); return { value: undefined, done: true }; },
            };
        },
    });

    const session = (id) => {
        const found = state.sessions.get(id);
        if (!found) throw failure('SessionNotFoundError', `session ${id} not found`);
        return found;
    };

    const client = () => ({
        server: { info: async () => { check(); return { version: state.version, pid: 4242, urls: ['http://127.0.0.1:1'], paths: { tmp: '/tmp' } }; } },
        integration: {
            get: async ({ integrationID }) => {
                check();
                if (state.login === 'unknown-integration' || state.login === 'cold') throw failure('IntegrationNotFoundError', 'no such integration');
                return { location: { directory: '/x' }, data: integrationRow(integrationID, state.login) };
            },
            list: async () => {
                check();
                const providers = [...new Set(state.models.map((model) => model.providerID))];
                return { location: { directory: '/x' }, data: state.login === 'unknown-integration' ? [] : providers.map((id) => integrationRow(id, state.login)) };
            },
        },
        provider: {
            list: async () => {
                check();
                const providers = state.providers ?? [...new Set(state.models.map((model) => model.providerID))];
                return { location: { directory: '/x' }, data: providers.map((id) => ({ id, integrationID: id, name: id, activation: 'auto', package: 'synthetic' })) };
            },
        },
        model: { list: async () => { check(); return { location: { directory: '/x' }, data: state.models }; } },
        agent: {
            get: async ({ agentID, location }) => {
                check();
                await hold('agent');
                const booted = bootLocation(location.directory);
                const rules = agentRules(booted, agentID);
                if (!rules || Date.now() - booted.bootedAt < (state.configDelayMs ?? 0)) throw failure('AgentNotFoundError', `Agent not found: ${agentID}`);
                return { location, data: { id: agentID, system: booted.config.agents[agentID].system, mode: 'primary', permissions: rules } };
            },
        },
        mcp: {
            list: async ({ location }) => {
                check();
                const booted = bootLocation(location.directory);
                return { location, data: [...booted.servers.values()].map((row) => ({ name: row.name, status: row.status })) };
            },
        },
        debug: {
            location: {
                evict: async ({ location }) => {
                    check();
                    const key = path.resolve(location.directory);
                    const booted = state.locations.get(key);
                    for (const row of booted?.servers.values() ?? []) row.client?.child.kill();
                    state.locations.delete(key);
                    state.evicted.push(key);
                },
            },
        },
        event: { subscribe: (options) => { check(); return events(options); } },
        session: {
            create: async (input) => {
                check();
                await hold('create');
                const id = `ses_${state.nextId++}`;
                const made = {
                    id, agent: input.agent ?? 'build', model: { ...input.model, variant: input.model?.variant ?? 'default' }, permissions: input.permissions ?? [], metadata: input.metadata ?? {}, title: input.title,
                    location: { directory: path.resolve(input.location?.directory ?? '/x') }, messages: [], running: false, outcome: null, interrupted: false, cost: 0, tokens: {}, time: { created: Date.now(), updated: Date.now() },
                };
                state.sessions.set(id, made);
                state.created.push({ ...input, configAtCreate: readConfig(made.location.directory), directoryExisted: fs.existsSync(made.location.directory) });
                bootLocation(made.location.directory);
                return { id, agent: made.agent, model: made.model, permissions: state.dropPermissions ? [] : made.permissions, location: made.location, projectID: 'proj', metadata: made.metadata, title: made.title, cost: 0, tokens: {}, time: made.time };
            },
            prompt: async ({ sessionID, text, files }) => {
                check();
                await hold('prompt');
                const found = session(sessionID);
                state.prompts.push({ sessionID, text, files: files ?? [] });
                const user = { id: `msg_${state.nextId++}`, type: 'user', time: { created: Date.now() }, text, ...(files?.length ? { files } : {}) };
                found.messages.push(user);
                setImmediate(() => { void run(found, text, files ?? []); });
                return { id: user.id, sessionID, type: 'user', payload: { text }, delivery: 'steer', time: { created: Date.now() } };
            },
            get: async ({ sessionID }) => { check(); const found = session(sessionID); return { id: found.id, agent: found.agent, outcome: found.outcome ?? undefined, permissions: found.permissions, location: found.location }; },
            active: async () => { check(); return Object.fromEntries([...state.sessions.values()].filter((found) => found.running).map((found) => [found.id, { type: 'running' }])); },
            interrupt: async ({ sessionID }) => {
                check();
                const found = session(sessionID);
                state.interrupts.push(sessionID);
                found.interrupted = true;
                found.interrupt?.();
                return { interrupted: found.running };
            },
            remove: async ({ sessionID }) => {
                check();
                const found = session(sessionID);
                if (state.removeFails) throw failure('UnknownError', 'remove failed');
                state.sessions.delete(sessionID);
                state.removed.push({ id: sessionID, running: found.running });
            },
            list: async ({ search } = {}) => { check(); state.listCalls += 1; return { data: [...state.sessions.values()].filter((found) => !search || String(found.title ?? '').includes(search)).map((found) => ({ id: found.id, title: found.title, metadata: found.metadata, location: found.location })), cursor: {} }; },
        },
        message: {
            list: async ({ sessionID, limit = 100 }) => {
                check();
                const found = session(sessionID);
                if (state.noMessages) return { data: [], cursor: { previous: null, next: null } };
                return { data: found.messages.slice(0, limit), cursor: { previous: 'p', next: 'n' } };
            },
        },
        permission: { reply: async (input) => { check(); state.replies.push(input); } },
    });

    const endpoint = { url: 'http://127.0.0.1:1', auth: { type: 'basic', username: 'opencode', password: 'synthetic-fixture-password' } };
    const libs = {
        OpenCode: { make: () => client() },
        Service: {
            discover: async ({ version } = {}) => {
                state.discoverCalls += 1;
                if (!state.up || (typeof version === 'function' && !version(state.version))) return undefined;
                return endpoint;
            },
            ensure: async (options = {}) => {
                state.ensureCalls.push(options);
                if (state.serviceStartFails) throw new Error('Failed to start server');
                state.up = true;
                return endpoint;
            },
            headers: () => ({ authorization: 'Basic synthetic' }),
        },
    };

    const close = () => {
        for (const location of state.locations.values()) for (const row of location.servers.values()) row.client?.child.kill();
        state.locations.clear();
    };

    return { libs, state, close, release };
}
