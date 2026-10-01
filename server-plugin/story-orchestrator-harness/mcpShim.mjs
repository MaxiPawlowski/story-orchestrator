import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const SHIM_NAME = 'story-orchestrator-bridge';
export const SHIM_VERSION = '1.0.0';
export const DEFAULT_PROTOCOL = '2025-06-18';

const isRecord = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);

export function loadShimTools(file, readFile = fs.readFileSync) {
    const parsed = JSON.parse(readFile(file, 'utf8'));
    if (!Array.isArray(parsed)) throw new Error('the tools file is not a list');
    return parsed.filter((tool) => isRecord(tool) && typeof tool.name === 'string' && isRecord(tool.inputSchema))
        .map((tool) => ({ name: tool.name, description: typeof tool.description === 'string' ? tool.description : '', inputSchema: tool.inputSchema }));
}

export function createShim({ tools, forward, write }) {
    const names = new Set(tools.map((tool) => tool.name));
    const result = (id, value) => write({ jsonrpc: '2.0', id, result: value });
    const failure = (id, code, message) => write({ jsonrpc: '2.0', id, error: { code, message } });
    const handle = async (message) => {
        if (!isRecord(message) || message.jsonrpc !== '2.0' || typeof message.method !== 'string') {
            if (isRecord(message) && 'id' in message && !('method' in message)) return undefined;
            return failure(isRecord(message) ? message.id ?? null : null, -32600, 'invalid request');
        }
        const { id, method, params } = message;
        const notification = id === undefined || id === null;
        if (notification) return undefined;
        if (method === 'initialize') {
            const requested = isRecord(params) && typeof params.protocolVersion === 'string' ? params.protocolVersion : DEFAULT_PROTOCOL;
            return result(id, { protocolVersion: requested, capabilities: { tools: { listChanged: false } }, serverInfo: { name: SHIM_NAME, version: SHIM_VERSION } });
        }
        if (method === 'ping') return result(id, {});
        if (method === 'tools/list') return result(id, { tools });
        if (method === 'tools/call') {
            const name = isRecord(params) ? params.name : undefined;
            if (typeof name !== 'string' || !names.has(name)) return failure(id, -32602, `unknown tool ${String(name).slice(0, 64)}`);
            const args = isRecord(params.arguments) ? params.arguments : {};
            const answer = await forward(name, args);
            return result(id, { content: [{ type: 'text', text: answer.text }], isError: !answer.ok });
        }
        return failure(id, -32601, `method not found: ${method.slice(0, 64)}`);
    };
    return { handle, names };
}

export function lineReader(onLine) {
    let buffer = '';
    return (chunk) => {
        buffer += chunk.toString('utf8');
        let at;
        while ((at = buffer.indexOf('\n')) >= 0) {
            const line = buffer.slice(0, at).trim();
            buffer = buffer.slice(at + 1);
            if (line) onLine(line);
        }
    };
}

export function connectBridge({ pipe, secret, connect = net.connect, onClose }) {
    const socket = connect(pipe);
    const pending = new Map();
    let next = 1;
    let closed = false;
    const end = () => {
        if (closed) return;
        closed = true;
        for (const resolve of pending.values()) resolve({ ok: false, text: 'the bridge closed' });
        pending.clear();
        onClose?.();
    };
    socket.on('error', end);
    socket.on('close', end);
    socket.on('data', lineReader((line) => {
        let message;
        try { message = JSON.parse(line); } catch { return; }
        const resolve = pending.get(message?.id);
        if (!resolve) return;
        pending.delete(message.id);
        resolve({ ok: message.ok === true, text: typeof message.text === 'string' ? message.text : '' });
    }));
    socket.write(`${JSON.stringify({ hello: secret })}\n`);
    const forward = (tool, args) => new Promise((resolve) => {
        if (closed) return resolve({ ok: false, text: 'the bridge closed' });
        const id = next;
        next += 1;
        pending.set(id, resolve);
        socket.write(`${JSON.stringify({ id, tool, args })}\n`);
        return undefined;
    });
    return { forward, socket };
}

export function runShim({ env = process.env, stdin = process.stdin, stdout = process.stdout, exit = (code) => process.exit(code) } = {}) {
    const tools = loadShimTools(env.SO_BRIDGE_TOOLS);
    const bridge = connectBridge({ pipe: env.SO_BRIDGE_PIPE, secret: env.SO_BRIDGE_SECRET ?? '', onClose: () => exit(0) });
    const shim = createShim({ tools, forward: bridge.forward, write: (message) => stdout.write(`${JSON.stringify(message)}\n`) });
    stdin.on('data', lineReader((line) => {
        let message;
        try { message = JSON.parse(line); } catch {
            stdout.write(`${JSON.stringify({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'parse error' } })}\n`);
            return;
        }
        void shim.handle(message);
    }));
    stdin.on('end', () => { bridge.socket.destroy(); exit(0); });
    return shim;
}

const invoked = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invoked) runShim();
