import { spawn as spawnDefault } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { memorySnapshot } from './telemetry.mjs';
import { performance } from 'node:perf_hooks';

export class FastTelemetry {
    constructor(python, { spawn = spawnDefault } = {}) {
        this.latest = null;
        this.listeners = new Set();
        this.error = null;
        this.sequence = 0;
        this.child = spawn(python, ['-u', fileURLToPath(new URL('./memory-probe.py', import.meta.url))], { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
        this.child.stdin.on('error', () => {});
        let buffer = '';
        this.child.stdout.on('data', (chunk) => {
            buffer += chunk.toString();
            const lines = buffer.split('\n'); buffer = lines.pop();
            for (const line of lines) {
                try { this.latest = JSON.parse(line); this.sequence += 1; for (const listener of this.listeners) listener(this.latest); }
                catch (error) { this.error = error.message; }
            }
        });
        this.child.stderr.on('data', (chunk) => { this.error = chunk.toString().slice(-2000); });
        this.child.on('error', (error) => { this.error = error.message; });
        this.child.on('exit', () => { this.latest = null; });
    }

    async snapshot() {
        const began = performance.now();
        const sequence = this.sequence;
        while (performance.now() - began < 1500) {
            if (this.latest && this.sequence > sequence) return this.latest;
            if (this.child.exitCode !== null) break;
            await new Promise((resolve) => setTimeout(resolve, 20));
        }
        return { ...await memorySnapshot(), highCadence: false };
    }

    subscribe(listener) { this.listeners.add(listener); return () => this.listeners.delete(listener); }
    setProcess(pid) { if (!this.child.stdin.destroyed) this.child.stdin.write(`${JSON.stringify({ pid })}\n`); }
    stop() { this.child.kill(); }
}
