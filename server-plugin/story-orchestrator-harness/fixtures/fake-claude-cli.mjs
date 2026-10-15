import { spawn } from 'node:child_process';
import fs from 'node:fs';

const argv = process.argv.slice(2);
if (argv[0] === '--version') {
    console.log('2.1.282 (Claude Code)');
    process.exit(0);
}
const flag = (name) => {
    const at = argv.indexOf(name);
    return at < 0 ? null : argv[at + 1];
};
const model = flag('--model');
const out = (event) => process.stdout.write(`${JSON.stringify(event)}\n`);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const readStdin = () => new Promise((resolve) => {
    let text = '';
    process.stdin.on('data', (chunk) => { text += chunk.toString('utf8'); });
    process.stdin.on('end', () => resolve(text));
});

function mcpClient(server) {
    const child = spawn(server.command, server.args ?? [], { env: { ...process.env, ...(server.env ?? {}) }, stdio: ['pipe', 'pipe', 'inherit'] });
    const pending = new Map();
    let buffer = '';
    let next = 1;
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
            } catch { continue; }
        }
    });
    const call = (method, params) => new Promise((resolve) => {
        const id = next;
        next += 1;
        pending.set(id, resolve);
        child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`);
    });
    return { call, close: () => child.kill() };
}

const prompt = await readStdin();
const marker = prompt.indexOf('FAKE:');
const script = marker >= 0 ? JSON.parse(prompt.slice(marker + 5).split('\n')[0]) : [{ text: 'hello' }];
const options = script.find((step) => step.options)?.options ?? {};
const config = JSON.parse(fs.readFileSync(flag('--mcp-config'), 'utf8'));
const servers = Object.entries(config.mcpServers ?? {});
const clients = {};
const tools = [];
for (const [name, server] of servers) {
    const client = mcpClient(server);
    clients[name] = client;
    await client.call('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'fake-claude', version: '0' } });
    const listed = await client.call('tools/list', {});
    for (const tool of listed.result?.tools ?? []) tools.push(`mcp__${name}__${tool.name}`);
}
const builtIn = flag('--tools') === '' ? [] : ['Bash', 'Read'];
out({ type: 'system', subtype: 'init', tools: [...builtIn, ...tools, ...(options.extraTool ? [options.extraTool] : [])], mcp_servers: servers.map(([name]) => ({ name, status: options.mcpFailed ? 'failed' : 'connected' })), model: options.initModel ?? model, permissionMode: 'default' });
if (options.rateLimit) out({ type: 'rate_limit_event', rate_limit_info: options.rateLimit });

let toolNumber = 0;
let finalText = '';
let stop = 'end_turn';
let denials = [];
for (const step of script) {
    if (step.options) continue;
    const served = step.served ?? model;
    if (step.hang) {
        await sleep(600_000);
    }
    if (step.call) {
        toolNumber += 1;
        const id = `toolu_${toolNumber}`;
        out({ type: 'stream_event', event: { type: 'message_start', message: { model: served } } });
        out({ type: 'assistant', message: { model: served, role: 'assistant', content: [{ type: 'tool_use', id, name: `mcp__so__${step.call}`, input: step.args ?? {} }], stop_reason: null } });
        const answer = await clients.so.call('tools/call', { name: step.call, arguments: step.args ?? {} });
        const text = answer.result?.content?.[0]?.text ?? answer.error?.message ?? '';
        finalText += `${step.call}:${answer.result?.isError ? 'err' : 'ok'}:${text}\n`;
        out({ type: 'user', message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: id, content: [{ type: 'text', text }] }] } });
    }
    if (step.foreign) {
        out({ type: 'stream_event', event: { type: 'message_start', message: { model: served } } });
        out({ type: 'assistant', message: { model: served, role: 'assistant', content: [{ type: 'tool_use', id: 'toolu_x', name: step.foreign, input: {} }], stop_reason: null } });
        await sleep(600_000);
    }
    if (step.synthetic) {
        out({ type: 'assistant', message: { model: '<synthetic>', role: 'assistant', content: [{ type: 'text', text: step.synthetic }], stop_reason: 'stop_sequence' } });
        out({ type: 'result', subtype: 'success', is_error: true, result: step.synthetic, stop_reason: 'stop_sequence', permission_denials: [] });
        process.exit(1);
    }
    if (step.refusal) {
        out({ type: 'stream_event', event: { type: 'message_start', message: { model: served } } });
        out({ type: 'stream_event', event: { type: 'message_delta', delta: { stop_reason: 'refusal' } } });
        await sleep(600_000);
    }
    if (step.refusalEvent) {
        out({ type: 'system', subtype: 'model_refusal_no_fallback', original_model: model });
        await sleep(600_000);
    }
    if (step.maxTokens) {
        out({ type: 'stream_event', event: { type: 'message_start', message: { model: served } } });
        out({ type: 'stream_event', event: { type: 'content_block_delta', delta: { type: 'text_delta', text: step.maxTokens } } });
        out({ type: 'stream_event', event: { type: 'message_delta', delta: { stop_reason: 'max_tokens' } } });
        await sleep(600_000);
    }
    if (step.deny) denials = [{ tool_name: step.deny }];
    if (step.text !== undefined) {
        out({ type: 'stream_event', event: { type: 'message_start', message: { model: served } } });
        out({ type: 'assistant', message: { model: served, role: 'assistant', content: [{ type: 'text', text: step.text }], stop_reason: null } });
        finalText += step.text;
    }
    if (step.resultStop) stop = step.resultStop;
}
out({ type: 'result', subtype: 'success', is_error: false, result: finalText, stop_reason: stop, usage: { input_tokens: 10, output_tokens: 5 }, total_cost_usd: 0.001, permission_denials: denials });
for (const client of Object.values(clients)) client.close();
process.exit(0);
