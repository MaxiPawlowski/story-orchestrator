import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { memorySnapshot } from './telemetry.mjs';
import { withinReserve } from './policy.mjs';
import { CONTROLLER_DEFAULTS } from './controllerStatus.mjs';

export function nativeArgs(config, profile, fitTargetMiB = config.reserves.gpuMiB) {
    const args = [...profile.args];
    if (config.modelLoadMode) {
        const at = args.indexOf('--load-mode');
        if (at >= 0) args.splice(at, 2);
        args.push('--load-mode', config.modelLoadMode);
    }
    return ['--model', config.model, '--host', '127.0.0.1', '--port', String(config.backendPort), '--alias', config.modelAlias,
        '--offline', '--no-mmproj', '--no-webui', '--threads', '8', '--threads-batch', '8', '--parallel', '1', '--kv-unified',
        '--flash-attn', 'on', '--cache-type-k', 'q8_0', '--cache-type-v', 'q8_0', '--cache-ram', '512', '--sleep-idle-seconds', '-1',
        '--fit', 'on', '--fit-target', String(fitTargetMiB + (config.fitMarginMiB ?? 0)), ...args];
}

export function profileContext(profile) {
    const at = profile.args?.indexOf('--ctx-size') ?? -1;
    const value = at >= 0 ? Number(profile.args[at + 1]) : NaN;
    return Number.isInteger(value) && value > 0 ? value : null;
}

export class ContextRefusal extends Error {
    constructor(promptTokens, outputTokens, context) {
        super(`The request needs ${promptTokens + outputTokens} tokens (prompt ${promptTokens} + reply ${outputTokens}), and prompt + reply must stay under the ${context}-token context this machine serves. Set the connection's context to ${context} or less; nothing was loaded or truncated.`);
        Object.assign(this, { promptTokens, outputTokens, context });
    }
}

export class NativeBackend {
    constructor(config, { snapshot = memorySnapshot } = {}) {
        this.config = config;
        this.snapshot = snapshot;
        this.url = `http://127.0.0.1:${config.backendPort}`;
        this.child = null;
        this.profile = null;
        this.fitTarget = null;
        this.desiredProfile = null;
        this.loading = null;
        this.lastError = null;
        this.loadMs = null;
        this.loads = 0;
        this.failedAt = new Map();
    }

    async load(name = this.config.defaultProfile, options = {}) {
        const fitTarget = Number.isFinite(options.fitTarget) ? Math.ceil(options.fitTarget) : null;
        while (this.loading) await this.loading;
        if (this.child && this.profile === name && this.fitTarget === fitTarget) return;
        const profile = this.config.profiles[name];
        if (!profile || profile.disabled) throw new Error('That residency profile is unavailable.');
        this.loading = this.start(name, profile, fitTarget);
        try { await this.loading; }
        catch (error) { this.lastError = error.message; await this.stopOwned(); throw error; }
        finally { this.loading = null; }
    }

    async ensure(name = this.profile ?? this.config.defaultProfile) {
        while (this.loading) await this.loading;
        return this.load(name, { fitTarget: this.fitTarget });
    }

    async start(name, profile, fitTarget) {
        const began = Date.now();
        await this.stopOwned();
        let occupied = false;
        try { await fetch(`${this.url}/health`, { signal: AbortSignal.timeout(1000) }); occupied = true; } catch {}
        if (occupied) throw new Error('The backend port is owned by another server; it will not be stopped.');
        const snapshot = await this.snapshot();
        const gpu = snapshot.gpus[0];
        const gpuBudget = gpu.freeMiB - Math.max(this.config.reserves.gpuMiB, fitTarget ?? 0);
        const spillMiB = Math.max(0, (profile.estimatedGpuMiB ?? 21500) - gpuBudget);
        const ramRequired = (profile.estimatedRamMiB ?? 6000) + spillMiB;
        if (gpuBudget < 2048 || snapshot.host.availableMiB < ramRequired + this.config.reserves.ramMiB || snapshot.host.commitFreeMiB < ramRequired + this.config.reserves.ramMiB) {
            throw new Error('Not enough free GPU/physical RAM for this profile while preserving desktop headroom.');
        }
        await fs.mkdir(this.config.stateDir, { recursive: true });
        const log = await fs.open(path.join(this.config.stateDir, `native-${Date.now()}-${name}.log`), 'a');
        const child = spawn(this.config.binary, nativeArgs(this.config, profile, fitTarget ?? this.config.reserves.gpuMiB), { windowsHide: true, stdio: ['ignore', log.fd, log.fd] });
        this.child = child;
        let spawnError;
        child.on('error', (error) => { spawnError = error; });
        child.on('exit', () => { void log.close(); if (this.child === child) { this.child = null; this.profile = null; } });
        const deadline = Date.now() + 240000;
        const admissionWindowMs = this.config.admissionWindowMs ?? 30000;
        let admissionUntil = null;
        while (Date.now() < deadline) {
            if (spawnError) throw spawnError;
            if (child.exitCode !== null) throw new Error(`Native backend exited with ${child.exitCode}; read its local log.`);
            try {
                if ((await fetch(`${this.url}/health`, { signal: AbortSignal.timeout(1000) })).ok) {
                    const after = await this.snapshot();
                    if (withinReserve(after, this.config.reserves)) {
                        this.profile = name;
                        this.fitTarget = fitTarget;
                        if (fitTarget === null || this.desiredProfile === null) this.desiredProfile = name;
                        this.lastError = null;
                        this.loadMs = Date.now() - began;
                        this.loads += 1;
                        return;
                    }
                    admissionUntil ??= Date.now() + admissionWindowMs;
                    if (Date.now() >= admissionUntil) throw new Error(`The loaded profile violates the measured memory reserve after ${Math.round(admissionWindowMs / 1000)}s (RAM ${Math.round(after.host.availableMiB)} MiB free, GPU ${Math.round(after.gpus[0].freeMiB)} MiB free).`);
                }
            } catch (error) { if (error.message.includes('memory reserve')) throw error; }
            await new Promise((resolve) => setTimeout(resolve, this.config.admissionPollMs ?? 1000));
        }
        throw new Error('Native backend load timed out.');
    }

    async unload() {
        while (this.loading) await this.loading.catch(() => {});
        await this.stopOwned();
    }

    async stopOwned() {
        this.fitTarget = null;
        const child = this.child;
        if (!child) return;
        const ended = new Promise((resolve) => child.once('exit', resolve));
        child.kill();
        await Promise.race([ended, new Promise((_, reject) => setTimeout(() => reject(new Error('The owned text process did not stop; no replacement will be started.')), 10000).unref())]);
        if (this.child === child) { this.child = null; this.profile = null; this.fitTarget = null; }
    }

    async forRequest(body, signal) {
        await this.ensure(this.profile ?? this.config.defaultProfile);
        const limit = this.config.maxContext ?? CONTROLLER_DEFAULTS.maxContext;
        const output = Number(body.n_predict ?? body.max_tokens ?? 1400);
        if (!Number.isInteger(output) || output < 0 || output > limit) throw new Error('Set a bounded output budget before generating.');
        const prompt = await this.promptTokens(body, signal);
        const required = prompt + output;
        const name = this.profileFor(required + 1, limit);
        if (!name) throw new ContextRefusal(prompt, output, this.servedContext(limit));
        if (name !== this.profile) await this.switchFor(name, `${required} tokens`);
    }

    async promptTokens(body, signal) {
        let prompt = body.prompt;
        if (typeof prompt !== 'string') {
            if (!Array.isArray(body.messages)) throw new Error('Could not count the prompt; refusing to guess a smaller context.');
            const rendered = await fetch(`${this.url}/apply-template`, {
                method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ messages: body.messages }), signal,
            });
            if (!rendered.ok) throw new Error('Could not render the chat for counting; refusing to guess a smaller context.');
            prompt = (await rendered.json()).prompt;
            if (typeof prompt !== 'string') throw new Error('The chat template did not return a prompt.');
        }
        const response = await fetch(`${this.url}/tokenize`, {
            method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ content: prompt, add_special: true }), signal,
        });
        if (!response.ok) throw new Error('Could not count the prompt; refusing to guess a smaller context.');
        const data = await response.json();
        if (!Array.isArray(data.tokens)) throw new Error('Tokenizer did not return tokens.');
        return data.tokens.length;
    }

    usableProfiles(limit = this.config.maxContext ?? CONTROLLER_DEFAULTS.maxContext) {
        const since = Date.now() - (this.config.contextRetryMs ?? 600000);
        return Object.entries(this.config.profiles)
            .map(([name, profile]) => ({ name, profile, context: profileContext(profile) }))
            .filter(({ profile, context }) => !profile.disabled && context !== null && context <= limit)
            .filter(({ name }) => name === this.profile || !(this.failedAt.get(name) > since))
            .sort((x, y) => x.context - y.context);
    }

    profileFor(required, limit) {
        const usable = this.usableProfiles(limit).filter(({ context }) => context >= required);
        if (usable.some(({ name }) => name === this.profile)) return this.profile;
        return usable[0]?.name ?? null;
    }

    servedContext(limit = this.config.maxContext ?? CONTROLLER_DEFAULTS.maxContext) {
        const usable = this.usableProfiles(limit);
        return usable.length ? usable[usable.length - 1].context : limit;
    }

    async switchFor(name, need = 'this request') {
        if (this.profile === name) return this.ensure(name);
        const previous = this.profile;
        const previousFit = this.fitTarget;
        const previousDesired = this.desiredProfile;
        this.desiredProfile = name;
        try { await this.ensure(name); this.failedAt.delete(name); }
        catch (error) {
            this.failedAt.set(name, Date.now());
            this.desiredProfile = previous ?? previousDesired;
            if (previous) await this.load(previous, { fitTarget: previousFit }).catch((reload) => { this.lastError = `${error.message} Reloading ${previous} also failed: ${reload.message}`; });
            throw new Error(`${need} needs the ${name} profile, which could not load: ${error.message}${previous ? ` ${previous} is loaded again.` : ''}`);
        }
    }

    status() { return { profile: this.profile, desiredProfile: this.desiredProfile, fitTargetMiB: this.fitTarget, pid: this.child?.pid ?? null, loading: Boolean(this.loading), loadMs: this.loadMs, loads: this.loads, lastError: this.lastError, servedContext: this.servedContext() }; }
}
