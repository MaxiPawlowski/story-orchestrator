import crypto from 'node:crypto';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const BRIDGE_HARNESSES = Object.freeze(['opencode']);
export const BRIDGE_SERVER = 'so';
export const BRIDGE_AGENT = 'so-agent';
export const BRIDGE_LIMITS = Object.freeze({
    maxTools: 64,
    maxToolBytes: 200_000,
    maxDescriptionChars: 2_000,
    maxSchemaDepth: 8,
    maxArgsBytes: 100_000,
    maxAnswerChars: 20_000,
    maxParked: 4,
    minSessionMs: 5_000,
    maxSessionMs: 900_000,
    defaultCallMs: 120_000,
    minCallMs: 1_000,
    maxCallMs: 600_000,
    maxWaitMs: 25_000,
    maxLineBytes: 1_000_000,
    tombstoneMs: 60_000,
    maxTombstones: 32,
});

const here = path.dirname(fileURLToPath(import.meta.url));
export const SHIM_PATH = path.join(here, 'mcpShim.mjs');

const TOOL_NAME = /^[A-Za-z][A-Za-z0-9_]{0,63}$/;
const TOOL_KEYS = new Set(['name', 'description', 'inputSchema']);
const SESSION_ID = /^[a-f0-9]{32}$/;
const ROLE_PATTERN = /^[a-z][a-z0-9-]{0,31}$/;
const EFFORTS = ['low', 'medium', 'high'];

const isRecord = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const depthOf = (value, depth = 0) => {
    if (depth > BRIDGE_LIMITS.maxSchemaDepth) return depth;
    if (Array.isArray(value)) return value.reduce((max, entry) => Math.max(max, depthOf(entry, depth + 1)), depth);
    if (isRecord(value)) return Object.values(value).reduce((max, entry) => Math.max(max, depthOf(entry, depth + 1)), depth);
    return depth;
};

const hasRef = (value) => {
    if (Array.isArray(value)) return value.some(hasRef);
    if (!isRecord(value)) return false;
    return Object.entries(value).some(([key, entry]) => key === '$ref' || key === '$dynamicRef' || hasRef(entry));
};

export function validateTools(tools) {
    if (!Array.isArray(tools) || !tools.length) return { issue: 'tools must be a non-empty list' };
    if (tools.length > BRIDGE_LIMITS.maxTools) return { issue: `at most ${BRIDGE_LIMITS.maxTools} tools` };
    let bytes;
    try { bytes = Buffer.byteLength(JSON.stringify(tools)); } catch { return { issue: 'tools are not JSON' }; }
    if (bytes > BRIDGE_LIMITS.maxToolBytes) return { issue: `tools are over ${BRIDGE_LIMITS.maxToolBytes} bytes` };
    const names = new Set();
    const out = [];
    for (const tool of tools) {
        if (!isRecord(tool)) return { issue: 'each tool must be an object' };
        const extra = Object.keys(tool).find((key) => !TOOL_KEYS.has(key));
        if (extra) return { issue: `unknown tool key ${extra.slice(0, 40)}` };
        if (typeof tool.name !== 'string' || !TOOL_NAME.test(tool.name)) return { issue: `tool name must match ${TOOL_NAME}` };
        if (names.has(tool.name)) return { issue: `duplicate tool ${tool.name}` };
        names.add(tool.name);
        if (typeof tool.description !== 'string' || tool.description.length > BRIDGE_LIMITS.maxDescriptionChars) return { issue: `${tool.name}: description must be a string of at most ${BRIDGE_LIMITS.maxDescriptionChars} chars` };
        const schema = tool.inputSchema;
        if (!isRecord(schema) || schema.type !== 'object') return { issue: `${tool.name}: inputSchema must be an object schema` };
        if (depthOf(schema) > BRIDGE_LIMITS.maxSchemaDepth) return { issue: `${tool.name}: inputSchema nests deeper than ${BRIDGE_LIMITS.maxSchemaDepth}` };
        if (hasRef(schema)) return { issue: `${tool.name}: inputSchema may not reference other schemas` };
        out.push({ name: tool.name, description: tool.description, inputSchema: JSON.parse(JSON.stringify(schema)) });
    }
    return { issue: null, tools: out };
}

const intIn = (value, min, max) => Number.isInteger(value) && value >= min && value <= max;

export function validateOpen(body, config, limits) {
    if (!isRecord(body)) return { issue: 'body must be a JSON object', kind: 'config' };
    const { harness, model, role, system, prompt, timeoutMs, callTimeoutMs, maxOutputChars, effort, tools } = body;
    if (!BRIDGE_HARNESSES.includes(harness)) return { issue: `the tool bridge runs on ${BRIDGE_HARNESSES.join(', ')} only`, kind: 'config' };
    if (typeof role !== 'string' || !ROLE_PATTERN.test(role)) return { issue: 'role must be a role id', kind: 'config' };
    if (typeof model !== 'string' || !config.harnesses[harness].models.some((entry) => entry.id === model)) return { issue: `model not permitted for ${harness}: ${String(model).slice(0, 80)}`, kind: 'config' };
    if (typeof system !== 'string' || typeof prompt !== 'string' || !prompt.trim()) return { issue: 'system and a non-empty prompt must be strings', kind: 'config' };
    if (prompt.length > limits.maxPromptChars) return { issue: `prompt is over ${limits.maxPromptChars} chars`, kind: 'refused' };
    if (system.length > limits.maxSystemChars) return { issue: `system is over ${limits.maxSystemChars} chars`, kind: 'refused' };
    if (!intIn(timeoutMs, BRIDGE_LIMITS.minSessionMs, BRIDGE_LIMITS.maxSessionMs)) return { issue: `timeoutMs must be ${BRIDGE_LIMITS.minSessionMs}-${BRIDGE_LIMITS.maxSessionMs}`, kind: 'config' };
    if (callTimeoutMs !== undefined && !intIn(callTimeoutMs, BRIDGE_LIMITS.minCallMs, BRIDGE_LIMITS.maxCallMs)) return { issue: `callTimeoutMs must be ${BRIDGE_LIMITS.minCallMs}-${BRIDGE_LIMITS.maxCallMs}`, kind: 'config' };
    if (!intIn(maxOutputChars, 1, limits.maxOutputChars)) return { issue: `maxOutputChars must be 1-${limits.maxOutputChars}`, kind: 'config' };
    if (effort !== undefined && effort !== null && !EFFORTS.includes(effort)) return { issue: `effort must be one of ${EFFORTS.join(', ')}`, kind: 'config' };
    const checked = validateTools(tools);
    if (checked.issue) return { issue: checked.issue, kind: 'refused' };
    return { issue: null, value: { harness, model, role, system, prompt, timeoutMs, callTimeoutMs: callTimeoutMs ?? BRIDGE_LIMITS.defaultCallMs, maxOutputChars, effort: effort ?? null, tools: checked.tools } };
}

export const bridgeAgentConfig = ({ systemFile, nodePath, shimPath, pipe, secret, toolsFile }) => JSON.stringify({
    $schema: 'https://opencode.ai/config.json',
    mcp: {
        [BRIDGE_SERVER]: {
            type: 'local',
            command: [nodePath, shimPath],
            environment: { SO_BRIDGE_PIPE: pipe, SO_BRIDGE_SECRET: secret, SO_BRIDGE_TOOLS: toolsFile },
            enabled: true,
        },
    },
    agent: {
        [BRIDGE_AGENT]: {
            mode: 'primary',
            prompt: `{file:${systemFile}}`,
            tools: { '*': false, [`${BRIDGE_SERVER}_*`]: true },
            permission: { edit: 'deny', bash: 'deny', webfetch: 'deny' },
        },
    },
});

export const bridgeArgv = ({ model, cwd, effort = null }) => ['run', '--pure', '--format', 'json', '--agent', BRIDGE_AGENT, '-m', model, '--dir', cwd, ...(EFFORTS.includes(effort) ? ['--variant', effort] : [])];

export const defaultPipe = (sessionId, owned, platform = process.platform) => (platform === 'win32' ? `\\\\.\\pipe\\so-agent-${sessionId}` : path.join(owned.root, 'bridge.sock'));

const toolNameOf = (event) => {
    const part = isRecord(event.part) ? event.part : {};
    const name = part.tool ?? part.name ?? event.tool ?? event.name;
    return typeof name === 'string' ? name : '';
};

export const isToolEvent = (event) => isRecord(event) && (/tool/i.test(String(event.type ?? '')) || /tool/i.test(String(event.part?.type ?? '')));

export const isShimTool = (name) => name.startsWith(`${BRIDGE_SERVER}_`);

const ENDED_KIND = { closed: 'lapsed', replaced: 'lapsed', shutdown: 'lapsed', timeout: 'timeout', 'call-timeout': 'timeout', refused: 'refused', finished: 'lapsed' };
const ENDED_TEXT = {
    closed: 'the session was closed',
    replaced: 'a newer session for this user and role replaced it',
    shutdown: 'the plugin shut down',
    timeout: 'the session reached its deadline; its process tree was stopped',
    'call-timeout': 'a tool call waited past its deadline for the page; the session was stopped',
    refused: 'the harness used a tool that is not the bridge\'s; the session was stopped and its answer discarded',
    finished: 'the session had already finished',
};

export function createAgentBridge({ config, env, helpers, host, spawnImpl, killTree, fsImpl, now = Date.now, nodePath = process.execPath, shimPath = SHIM_PATH, pipeFor = defaultPipe, netImpl = net, limits }) {
    const sessions = new Map();
    const owners = new Map();
    const tombstones = new Map();

    const remember = (session, event) => {
        tombstones.set(session.id, { user: session.user, event, at: now() });
        for (const [id, stone] of tombstones) if (tombstones.size > BRIDGE_LIMITS.maxTombstones || now() - stone.at > BRIDGE_LIMITS.tombstoneMs) tombstones.delete(id);
    };

    const endedEvent = (reason, message = null) => ({ kind: 'ended', errorKind: ENDED_KIND[reason] ?? 'lapsed', message: message ?? ENDED_TEXT[reason] ?? reason });

    const wake = (session) => {
        while (session.waiters.length && session.events.length) {
            const waiter = session.waiters.shift();
            waiter(session.events.shift());
        }
    };

    const teardown = (session, reason, event = null) => {
        if (session.closing) return session.closing;
        const terminal = event ?? endedEvent(reason);
        session.closed = true;
        clearTimeout(session.deadlineTimer);
        clearTimeout(session.graceTimer);
        sessions.delete(session.id);
        if (owners.get(session.ownerKey) === session.id) owners.delete(session.ownerKey);
        remember(session, terminal);
        for (const call of session.parked.values()) {
            clearTimeout(call.timer);
            reply(call.socket, call.rpcId, false, 'the bridge session ended');
        }
        session.parked.clear();
        session.events.length = 0;
        for (const waiter of session.waiters.splice(0)) waiter(terminal);
        session.controller.abort();
        for (const socket of session.sockets) socket.destroy();
        session.sockets.clear();
        session.closing = (async () => {
            await new Promise((resolve) => { try { session.server.close(() => resolve()); } catch { resolve(); } });
            await session.done;
            const closed = helpers.closeOwnedHome(session.owned, fsImpl);
            host.noteClosed(session.harness, closed);
            host.log?.(JSON.stringify({ harness: session.harness, model: session.model, ms: now() - session.openedAt, calls: session.nextCall - 1, kind: terminal.kind === 'done' ? 'ok' : terminal.errorKind }));
            session.report = { reason, ...closed };
            return session.report;
        })();
        return session.closing;
    };

    const reply = (socket, id, ok, text) => {
        try { socket.write(`${JSON.stringify({ id, ok, text })}\n`); } catch { return undefined; }
    };

    const park = (session, socket, message) => {
        if (session.closed || session.finished) return reply(socket, message.id, false, 'the bridge session has ended');
        if (typeof message.tool !== 'string' || !session.tools.has(message.tool)) return reply(socket, message.id, false, `unknown tool ${String(message.tool).slice(0, 64)}`);
        if (!isRecord(message.args)) return reply(socket, message.id, false, 'arguments must be an object');
        if (Buffer.byteLength(JSON.stringify(message.args)) > BRIDGE_LIMITS.maxArgsBytes) return reply(socket, message.id, false, `arguments are over ${BRIDGE_LIMITS.maxArgsBytes} bytes`);
        if (session.parked.size >= BRIDGE_LIMITS.maxParked) return reply(socket, message.id, false, 'too many tool calls at once: call one tool at a time and wait for its result');
        const callId = `c${session.nextCall}`;
        session.nextCall += 1;
        const timer = setTimeout(() => { void teardown(session, 'call-timeout'); }, session.callTimeoutMs);
        session.parked.set(callId, { callId, socket, rpcId: message.id, tool: message.tool, delivered: false, timer });
        session.events.push({ kind: 'call', callId, tool: message.tool, args: message.args });
        wake(session);
        return undefined;
    };

    const onConnection = (session, socket) => {
        if (session.closed || session.shimConnected) {
            socket.destroy();
            return;
        }
        session.sockets.add(socket);
        let buffer = '';
        let greeted = false;
        socket.on('error', () => undefined);
        socket.on('close', () => session.sockets.delete(socket));
        socket.on('data', (chunk) => {
            buffer += chunk.toString('utf8');
            if (buffer.length > BRIDGE_LIMITS.maxLineBytes) {
                socket.destroy();
                return;
            }
            let at;
            while ((at = buffer.indexOf('\n')) >= 0) {
                const line = buffer.slice(0, at);
                buffer = buffer.slice(at + 1);
                let message;
                try { message = JSON.parse(line); } catch { socket.destroy(); return; }
                if (!greeted) {
                    const offered = Buffer.from(typeof message?.hello === 'string' ? message.hello : '');
                    const expected = Buffer.from(session.secret);
                    if (offered.length !== expected.length || !crypto.timingSafeEqual(offered, expected) || session.shimConnected) {
                        socket.destroy();
                        return;
                    }
                    greeted = true;
                    session.shimConnected = true;
                    continue;
                }
                if (isRecord(message)) park(session, socket, message);
            }
        });
    };

    const watchStdout = (session) => {
        let buffer = '';
        return (text) => {
            buffer += text;
            let at;
            while ((at = buffer.indexOf('\n')) >= 0) {
                const line = buffer.slice(0, at).trim();
                buffer = buffer.slice(at + 1);
                if (!line.startsWith('{')) continue;
                let event;
                try { event = JSON.parse(line); } catch { continue; }
                if (isToolEvent(event) && !isShimTool(toolNameOf(event))) {
                    session.foreign += 1;
                    void teardown(session, 'refused');
                }
            }
        };
    };

    const finishRun = (session, run) => {
        if (session.closed) return;
        session.finished = true;
        const kept = run.stdout.split(/\r?\n/).filter((line) => {
            const trimmed = line.trim();
            if (!trimmed.startsWith('{')) return true;
            try { return !isToolEvent(JSON.parse(trimmed)); } catch { return true; }
        }).join('\n');
        const outcome = helpers.classify('opencode', { ...run, stdout: kept }, { maxOutputChars: session.maxOutputChars, now: now() });
        if (outcome.kind === 'quota' && outcome.retryAt) host.noteQuota(session.harness, outcome.retryAt);
        const event = outcome.ok ? { kind: 'done', text: outcome.text, finish: outcome.finish, usage: outcome.usage ?? null } : { kind: 'ended', errorKind: outcome.kind, message: outcome.message };
        for (const call of session.parked.values()) {
            clearTimeout(call.timer);
            reply(call.socket, call.rpcId, false, 'the harness finished');
        }
        session.parked.clear();
        session.events = session.events.filter((entry) => entry.kind !== 'call');
        session.events.push(event);
        session.graceTimer = setTimeout(() => { void teardown(session, 'finished', event); }, session.callTimeoutMs);
        wake(session);
    };

    const countFor = (harness) => [...sessions.values()].filter((session) => session.harness === harness && !session.closed).length;

    const open = async (request, { user = 'default-user' } = {}) => {
        const blocked = await host.ready(request.harness);
        if (blocked) return { ok: false, ...blocked };
        const ownerKey = `${user}|${request.role}`;
        const previous = owners.get(ownerKey);
        if (previous && sessions.has(previous)) await teardown(sessions.get(previous), 'replaced');
        if (countFor(request.harness) >= config.harnesses[request.harness].concurrency) return { ok: false, kind: 'busy', message: `${request.harness} already runs ${config.harnesses[request.harness].concurrency} agent session(s); retry shortly` };
        const id = crypto.randomBytes(16).toString('hex');
        const secret = crypto.randomBytes(32).toString('hex');
        let owned;
        try {
            owned = helpers.openOwnedHome(request.harness, { tmpRoot: config.tmpRoot, loginFile: host.loginFile(request.harness), cacheDir: host.cacheDir, fsImpl });
        } catch (error) {
            return { ok: false, kind: 'config', message: `the bridge could not prepare its owned home: ${error.code ?? error.message}` };
        }
        owned.systemFile = path.join(owned.tmp, 'system.txt');
        const toolsFile = path.join(owned.tmp, 'tools.json');
        fsImpl.writeFileSync(owned.systemFile, request.system, 'utf-8');
        fsImpl.writeFileSync(toolsFile, JSON.stringify(request.tools), 'utf-8');
        const pipe = pipeFor(id, owned);
        const session = {
            id, user, ownerKey, role: request.role, harness: request.harness, model: request.model, owned, secret, pipe,
            tools: new Set(request.tools.map((tool) => tool.name)), toolsFile,
            sockets: new Set(), parked: new Map(), events: [], waiters: [], nextCall: 1, foreign: 0,
            callTimeoutMs: request.callTimeoutMs, maxOutputChars: request.maxOutputChars,
            controller: new AbortController(), closed: false, finished: false, shimConnected: false, closing: null, done: Promise.resolve(), openedAt: now(), deadlineAt: now() + request.timeoutMs,
        };
        session.server = netImpl.createServer((socket) => onConnection(session, socket));
        try {
            await new Promise((resolve, reject) => {
                session.server.once('error', reject);
                session.server.listen(pipe, () => { session.server.off('error', reject); resolve(); });
            });
        } catch (error) {
            helpers.closeOwnedHome(owned, fsImpl);
            return { ok: false, kind: 'config', message: `the bridge could not open its local channel: ${error.code ?? error.message}` };
        }
        sessions.set(id, session);
        owners.set(ownerKey, id);
        const childEnvironment = helpers.childEnv(request.harness, owned, env);
        childEnvironment.OPENCODE_CONFIG_CONTENT = bridgeAgentConfig({ systemFile: owned.systemFile, nodePath, shimPath, pipe, secret, toolsFile });
        host.noteSpawn(request.harness);
        session.done = helpers.runProcess({
            bin: host.binary(request.harness),
            argv: bridgeArgv({ model: request.model, cwd: owned.cwd, effort: request.effort }),
            env: childEnvironment,
            cwd: owned.cwd,
            stdin: request.prompt,
            deadlineMs: request.timeoutMs,
            maxOutputChars: request.maxOutputChars,
            spawnImpl,
            killTree,
            signal: session.controller.signal,
            onStdout: watchStdout(session),
        }).then((run) => { finishRun(session, run); });
        session.deadlineTimer = setTimeout(() => { void teardown(session, 'timeout'); }, request.timeoutMs);
        return { ok: true, sessionId: id, deadlineAt: session.deadlineAt };
    };

    const lookup = (sessionId, user) => {
        if (typeof sessionId !== 'string' || !SESSION_ID.test(sessionId)) return { error: { status: 400, error: 'sessionId is not a bridge session id' } };
        const session = sessions.get(sessionId);
        if (session && session.user === user && !session.closed) return { session };
        const stone = tombstones.get(sessionId);
        if (stone && stone.user === user) return { ended: stone.event };
        return { error: { status: 404, error: 'no such bridge session for this user' } };
    };

    const deliver = (session, event) => {
        if (event.kind === 'call') {
            const call = session.parked.get(event.callId);
            if (call) call.delivered = true;
        } else {
            void teardown(session, 'finished', event);
        }
        return event;
    };

    const next = async (sessionId, { user = 'default-user', waitMs = BRIDGE_LIMITS.maxWaitMs, signal = null } = {}) => {
        const found = lookup(sessionId, user);
        if (found.error) return found;
        if (found.ended) return { event: found.ended };
        const { session } = found;
        if (session.events.length) return { event: deliver(session, session.events.shift()) };
        const wait = Math.max(0, Math.min(Number.isInteger(waitMs) ? waitMs : BRIDGE_LIMITS.maxWaitMs, BRIDGE_LIMITS.maxWaitMs));
        const event = await new Promise((resolve) => {
            let settled = false;
            const done = (value) => {
                if (settled) return;
                settled = true;
                clearTimeout(timer);
                signal?.removeEventListener('abort', onAbort);
                const at = session.waiters.indexOf(done);
                if (at >= 0) session.waiters.splice(at, 1);
                resolve(value);
            };
            const timer = setTimeout(() => done({ kind: 'pending' }), wait);
            const onAbort = () => done(null);
            signal?.addEventListener('abort', onAbort);
            session.waiters.push(done);
        });
        if (!event) return { event: { kind: 'pending' } };
        if (event.kind === 'pending' || session.closed) return { event };
        return { event: deliver(session, event) };
    };

    const answer = (sessionId, { user = 'default-user', callId, ok, text } = {}) => {
        const found = lookup(sessionId, user);
        if (found.error) return found;
        if (found.ended) return { error: { status: 409, error: 'the bridge session has ended' } };
        const { session } = found;
        const call = typeof callId === 'string' ? session.parked.get(callId) : undefined;
        if (!call || !call.delivered) return { error: { status: 409, error: 'no delivered tool call with that id waits in this session' } };
        if (typeof text !== 'string') return { error: { status: 400, error: 'text must be a string' } };
        clearTimeout(call.timer);
        session.parked.delete(callId);
        reply(call.socket, call.rpcId, ok === true, text.slice(0, BRIDGE_LIMITS.maxAnswerChars));
        return { value: { answered: true } };
    };

    const close = async (sessionId, { user = 'default-user' } = {}) => {
        const found = lookup(sessionId, user);
        if (found.error) return found;
        if (found.ended) return { value: { closed: true } };
        await teardown(found.session, 'closed');
        return { value: { closed: true } };
    };

    const shutdown = () => Promise.all([...sessions.values()].map((session) => teardown(session, 'shutdown')));

    const counts = () => ({ sessions: sessions.size, owners: owners.size });

    return { open, next, answer, close, shutdown, counts, sessions, teardown };
}
