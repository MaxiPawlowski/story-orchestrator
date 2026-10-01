import { spawn } from 'node:child_process';

const emit = (event) => process.stdout.write(`${JSON.stringify(event)}\n`);

const readStdin = () => new Promise((resolve) => {
    let text = '';
    process.stdin.on('data', (chunk) => { text += chunk.toString('utf8'); });
    process.stdin.on('end', () => resolve(text));
});

const startMcp = (server) => {
    const child = spawn(server.command[0], server.command.slice(1), { env: { ...process.env, ...(server.environment ?? {}) }, stdio: ['pipe', 'pipe', 'inherit'] });
    const pending = new Map();
    let buffer = '';
    let next = 1;
    child.stdout.on('data', (chunk) => {
        buffer += chunk.toString('utf8');
        let at;
        while ((at = buffer.indexOf('\n')) >= 0) {
            const line = buffer.slice(0, at);
            buffer = buffer.slice(at + 1);
            const message = JSON.parse(line);
            pending.get(message.id)?.(message);
            pending.delete(message.id);
        }
    });
    const request = (method, params) => new Promise((resolve) => {
        const id = next;
        next += 1;
        pending.set(id, resolve);
        child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`);
    });
    const notify = (method) => child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', method })}\n`);
    return { request, notify, child };
};

const config = JSON.parse(process.env.OPENCODE_CONFIG_CONTENT ?? '{}');
const agentName = process.argv[process.argv.indexOf('--agent') + 1];
const agent = config.agent?.[agentName] ?? {};
const prompt = await readStdin();
const marker = prompt.indexOf('FAKE:');
const script = marker >= 0 ? JSON.parse(prompt.slice(marker + 5).trim().split('\n')[0]) : [{ list: true }];

const servers = Object.entries(config.mcp ?? {}).filter(([, server]) => server.enabled !== false && server.type === 'local');
const clients = [];
for (const [name, server] of servers) {
    const client = startMcp(server);
    const init = await client.request('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'fake-opencode', version: '0' } });
    client.notify('notifications/initialized');
    const listed = await client.request('tools/list', {});
    clients.push({ name, client, init: init.result, tools: listed.result.tools });
}
const allowed = (tool) => {
    const rules = agent.tools ?? {};
    let verdict = true;
    for (const [pattern, value] of Object.entries(rules)) {
        const regex = new RegExp(`^${pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*')}$`);
        if (regex.test(tool)) verdict = value;
    }
    return verdict;
};
const exposed = clients.flatMap(({ name, tools }) => tools.map((tool) => `${name}_${tool.name}`)).filter(allowed);

emit({ type: 'step_start', part: {} });
const said = [];
for (const step of script) {
    if (step.list) said.push(JSON.stringify({ exposed, servers: clients.map(({ name, init }) => ({ name, protocol: init.protocolVersion })) }));
    if (step.burst) {
        const [server] = clients;
        const answers = await Promise.all(Array.from({ length: step.burst }, () => server.client.request('tools/call', { name: step.tool, arguments: {} })));
        for (const answer of answers) said.push(`burst:${answer.result?.isError ? 'error' : 'ok'}:${answer.result?.content?.[0]?.text ?? ''}`);
    }
    if (step.call) {
        const [server] = clients;
        const answer = await server.client.request('tools/call', { name: step.call, arguments: step.args ?? {} });
        const text = answer.result?.content?.[0]?.text ?? answer.error?.message ?? '';
        emit({ type: 'tool_use', part: { type: 'tool', tool: `${server.name}_${step.call}`, state: { status: 'completed', output: text } } });
        said.push(`${step.call}:${answer.result?.isError ? 'error' : 'ok'}:${text}`);
    }
    if (step.foreign) emit({ type: 'tool_use', part: { type: 'tool', tool: step.foreign, state: { status: 'running' } } });
    if (step.hang) await new Promise(() => undefined);
    if (step.say) said.push(step.say);
}
emit({ type: 'text', part: { type: 'text', text: said.join('\n') } });
emit({ type: 'step_finish', part: { reason: 'stop', tokens: { input: 100, output: 10, cache: { read: 0 } } } });
for (const { client } of clients) client.child.kill();
process.exit(0);
