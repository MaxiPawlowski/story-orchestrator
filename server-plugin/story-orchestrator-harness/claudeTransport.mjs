import fs from 'node:fs';
import path from 'node:path';
import { BRIDGE_MODELS, BRIDGE_SERVER, SHIM_PATH } from './agentBridge.mjs';
import { AUTH_TEXT, CONTEXT_TEXT, QUOTA_TEXT } from './errors.mjs';

export const CLAUDE_AGENT_MODELS = BRIDGE_MODELS.claude;
export const CLAUDE_AGENT_CWD = 'story-orchestrator-authoring';
export const CLAUDE_AGENT_ENV = Object.freeze({
    CLAUDE_CODE_NO_MODEL_FALLBACK: '1',
    CLAUDE_CODE_DISABLE_REFUSAL_FALLBACK: '1',
    CLAUDE_CODE_DISABLE_REFUSAL_RETRY: '1',
    CLAUDE_CODE_DISABLE_LEGACY_MODEL_REMAP: '1',
    DISABLE_AUTOUPDATER: '1',
});
export const CLAUDE_AGENT_LIMITS = Object.freeze({ streamChars: 4_000_000, connectMs: 30_000, callMarginMs: 10_000 });
const EFFORTS = ['low', 'medium', 'high'];

const isRecord = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);

export const bridgeToolName = (name) => `mcp__${BRIDGE_SERVER}__${name}`;

export const canonicalModel = (id) => String(id ?? '').toLowerCase().replace(/\[[^\]]*\]$/, '').replace(/-\d{8}$/, '').trim();

export function claudeMcpConfig({ nodePath, shimPath = SHIM_PATH, pipe, secret, toolsFile }) {
    return JSON.stringify({ mcpServers: { [BRIDGE_SERVER]: { type: 'stdio', command: nodePath, args: [shimPath], env: { SO_BRIDGE_PIPE: pipe, SO_BRIDGE_SECRET: secret, SO_BRIDGE_TOOLS: toolsFile } } } });
}

export function claudeAgentArgv({ model, effort = null, systemFile, mcpFile, tools }) {
    const level = EFFORTS.includes(effort) ? effort : null;
    return ['-p', '--tools', '', '--strict-mcp-config', '--mcp-config', mcpFile, '--setting-sources', '', '--no-session-persistence', '--disable-slash-commands',
        '--permission-prompts', 'none', '--allowedTools', tools.map((tool) => bridgeToolName(tool.name)).join(','),
        '--system-prompt-file', systemFile, '--input-format', 'text', '--output-format', 'stream-json', '--verbose', '--include-partial-messages',
        '--model', model, ...(level ? ['--effort', level] : [])];
}

export function claudeAgentEnv(base, { callTimeoutMs }) {
    return { ...base, ...CLAUDE_AGENT_ENV, MCP_TIMEOUT: String(CLAUDE_AGENT_LIMITS.connectMs), MCP_TOOL_TIMEOUT: String(callTimeoutMs + CLAUDE_AGENT_LIMITS.callMarginMs) };
}

const blockText = (content) => (Array.isArray(content) ? content.filter((block) => block?.type === 'text' && typeof block.text === 'string').map((block) => block.text).join('') : '');

const localError = (text) => {
    if (!CONTEXT_TEXT.test(text) && AUTH_TEXT.test(text)) return { kind: 'auth', message: 'claude is not logged in on the machine running SillyTavern: run `claude` once in a terminal there' };
    if (!CONTEXT_TEXT.test(text) && QUOTA_TEXT.test(text)) return { kind: 'quota', message: `claude reports its usage limit: ${text}`.slice(0, 400) };
    return { kind: 'transport', message: `claude stopped with a local error: ${text || 'no detail'}`.slice(0, 400) };
};

export function createStreamWatcher({ model, tools, onVerdict = () => undefined, onMeter = () => undefined }) {
    const allowed = new Set(tools.map((tool) => bridgeToolName(tool.name)));
    const wanted = canonicalModel(model);
    let buffer = '';
    let verdict = null;
    let partial = '';
    let initSeen = false;
    const settle = (value) => {
        if (verdict) return;
        verdict = value;
        onVerdict(value);
    };
    const refuse = (message) => settle({ ok: false, kind: 'refused', message });
    const served = (id, where) => {
        if (typeof id !== 'string' || !id) return;
        if (id === '<synthetic>') return;
        if (canonicalModel(id) !== wanted) refuse(`claude answered from ${id.slice(0, 80)}, not the requested ${model} (${where}); the answer is discarded`);
    };
    const onEvent = (event) => {
        if (!isRecord(event) || verdict) return;
        if (event.type === 'system' && event.subtype === 'init') {
            initSeen = true;
            const offered = Array.isArray(event.tools) ? event.tools : [];
            const extra = offered.filter((name) => !allowed.has(name));
            if (extra.length) return refuse(`claude offered tools beyond the bridge's (${extra.slice(0, 4).join(', ')}); the session was stopped`);
            const servers = Array.isArray(event.mcp_servers) ? event.mcp_servers : [];
            if (servers.some((row) => row?.name !== BRIDGE_SERVER)) return refuse('claude loaded an MCP server other than the bridge\'s; the session was stopped');
            if (!servers.some((row) => row?.name === BRIDGE_SERVER && row.status === 'connected')) return settle({ ok: false, kind: 'config', message: 'the bridge\'s tool server did not connect to claude' });
            return served(event.model, 'init');
        }
        if (event.type === 'system' && typeof event.subtype === 'string' && event.subtype.startsWith('model_refusal')) return refuse('claude refused this request; a refusal is final and is not retried');
        if (event.type === 'system' && /^model_(fallback|consent_fallback)$/.test(event.subtype ?? '')) return refuse(`claude switched away from ${model}; the answer is discarded`);
        if (event.type === 'rate_limit_event' && isRecord(event.rate_limit_info)) return onMeter(event.rate_limit_info);
        if (event.type === 'stream_event' && isRecord(event.event)) {
            const inner = event.event;
            if (inner.type === 'message_start') {
                partial = '';
                return served(inner.message?.model, 'message_start');
            }
            if (inner.type === 'content_block_delta' && inner.delta?.type === 'text_delta' && typeof inner.delta.text === 'string') partial += inner.delta.text;
            if (inner.type === 'content_block_start' && isRecord(inner.content_block) && /tool_use$/.test(inner.content_block.type ?? '') && !allowed.has(inner.content_block.name)) {
                return refuse(`claude tried a tool that is not the bridge's (${String(inner.content_block.name).slice(0, 64)}); the session was stopped`);
            }
            if (inner.type === 'message_delta' && inner.delta?.stop_reason === 'refusal') return refuse('claude refused this request; a refusal is final and is not retried');
            if (inner.type === 'message_delta' && inner.delta?.stop_reason === 'max_tokens') return settle({ ok: true, text: partial, finish: 'length', usage: null });
            return undefined;
        }
        if (event.type === 'assistant' && isRecord(event.message)) {
            const message = event.message;
            if (message.model === '<synthetic>') return settle({ ok: false, ...localError(blockText(message.content)) });
            served(message.model, 'assistant');
            if (verdict) return undefined;
            const foreign = (Array.isArray(message.content) ? message.content : []).find((block) => /tool_use$/.test(block?.type ?? '') && !allowed.has(block.name));
            if (foreign) return refuse(`claude tried a tool that is not the bridge's (${String(foreign.name).slice(0, 64)}); the session was stopped`);
            if (message.stop_reason === 'refusal') return refuse('claude refused this request; a refusal is final and is not retried');
            if (message.stop_reason === 'max_tokens') return settle({ ok: true, text: blockText(message.content), finish: 'length', usage: null });
            return undefined;
        }
        if (event.type === 'result') {
            if (event.stop_reason === 'refusal') return refuse('claude refused this request; a refusal is final and is not retried');
            if (!initSeen) return settle({ ok: false, kind: 'malformed', message: 'claude finished without reporting its session setup' });
        }
        return undefined;
    };
    const push = (chunk) => {
        buffer += chunk;
        let at;
        while ((at = buffer.indexOf('\n')) >= 0) {
            const line = buffer.slice(0, at).trim();
            buffer = buffer.slice(at + 1);
            if (!line.startsWith('{')) continue;
            try { onEvent(JSON.parse(line)); } catch { continue; }
        }
    };
    return { push, verdict: () => verdict, initSeen: () => initSeen };
}

export function readMeter(info, now = Date.now()) {
    if (!isRecord(info)) return null;
    const windows = isRecord(info.unifiedWindows) ? Object.fromEntries(Object.entries(info.unifiedWindows).filter(([, row]) => isRecord(row))
        .map(([name, row]) => [name, { utilization: typeof row.utilization === 'number' ? row.utilization : null, resetsAt: Number.isFinite(row.resetsAt) ? row.resetsAt * 1000 : null }])) : {};
    return { status: typeof info.status === 'string' ? info.status : null, resetsAt: Number.isFinite(info.resetsAt) ? info.resetsAt * 1000 : null, windows, observedAt: now };
}

export function createClaudeAgentTransport({ binary, runProcess, childEnv, classify, env = process.env, fsImpl = fs, nodePath = process.execPath, spawnImpl, killTree, onMeter = () => undefined, now = Date.now }) {
    const writePrivate = (file, text) => {
        fsImpl.writeFileSync(file, text, { encoding: 'utf-8', mode: 0o600 });
        try { fsImpl.chmodSync(file, 0o600); } catch { return; }
    };

    const runAgent = async ({ request, owned, pipe, secret, toolsFile, signal, onForeign, deadlineMs }) => {
        const bin = binary();
        if (!bin) return { ok: false, kind: 'config', message: 'claude is not installed on the machine running SillyTavern' };
        if (request.images?.length) return { ok: false, kind: 'config', message: 'pictures ride the opencode tool bridge only' };
        const cwd = path.join(owned.root, CLAUDE_AGENT_CWD);
        const systemFile = path.join(owned.tmp, 'system.txt');
        const mcpFile = path.join(owned.tmp, 'mcp.json');
        try {
            fsImpl.mkdirSync(cwd, { recursive: true });
            fsImpl.writeFileSync(systemFile, request.system, 'utf-8');
            writePrivate(mcpFile, claudeMcpConfig({ nodePath, pipe, secret, toolsFile }));
        } catch (error) {
            return { ok: false, kind: 'config', message: `the plugin could not prepare the wizard's claude session (${error?.code ?? error?.message ?? 'error'})` };
        }
        const controller = new AbortController();
        const onAbort = () => controller.abort();
        signal?.addEventListener('abort', onAbort);
        if (signal?.aborted) onAbort();
        let meter = null;
        const watcher = createStreamWatcher({
            model: request.model,
            tools: request.tools,
            onMeter: (info) => {
                meter = readMeter(info, now());
                onMeter(meter);
            },
            onVerdict: (verdict) => {
                if (verdict.kind === 'refused' && /tool|MCP server/.test(verdict.message)) onForeign?.();
                controller.abort();
            },
        });
        try {
            const run = await runProcess({
                bin,
                argv: claudeAgentArgv({ model: request.model, effort: request.effort, systemFile, mcpFile, tools: request.tools }),
                env: claudeAgentEnv(childEnv('claude', owned, env), { callTimeoutMs: request.callTimeoutMs }),
                cwd,
                stdin: request.prompt,
                deadlineMs,
                maxOutputChars: CLAUDE_AGENT_LIMITS.streamChars,
                signal: controller.signal,
                onStdout: watcher.push,
                ...(spawnImpl ? { spawnImpl } : {}),
                ...(killTree ? { killTree } : {}),
            });
            const verdict = watcher.verdict();
            if (verdict) return verdict.ok ? { ...verdict, text: verdict.text.slice(0, request.maxOutputChars) } : verdict;
            if (run.killed === 'output-bound') return { ok: false, kind: 'malformed', message: 'claude\'s event stream passed its bound before the session finished' };
            const outcome = classify('claude', run, { maxOutputChars: request.maxOutputChars, now: now() });
            if (!outcome.ok && outcome.kind === 'quota' && !outcome.retryAt && meter?.resetsAt) return { ...outcome, retryAt: meter.resetsAt };
            return outcome;
        } finally {
            signal?.removeEventListener('abort', onAbort);
        }
    };

    return { runAgent };
}
