import path from 'node:path';
import { brokerAddress } from './managed.mjs';

export const ADAPTERS = Object.freeze(['none', 'observe', 'supervise', 'managed']);
const LOOPBACK_HOSTS = ['127.0.0.1', 'localhost', '[::1]'];
const ARG_REFUSED = /^--(?:host|port|listen|api-key|ssl-|path)/;
const REFUSED_KEYS = ['allowRemote', 'publicHost', 'bindAll'];

const fail = (message) => { throw new Error(`GPU broker config: ${message}`); };
const isRecord = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const absolute = (value, name) => {
    if (typeof value !== 'string' || !value || !path.isAbsolute(value)) fail(`${name} must be an absolute path in config.json.`);
    return value;
};
const loopbackUrl = (value, name) => {
    let url;
    try { url = new URL(value); } catch { fail(`${name} must be a URL.`); }
    if (url.protocol !== 'http:' || !LOOPBACK_HOSTS.includes(url.hostname)) fail(`${name} must be an http loopback address.`);
    return value.replace(/\/$/, '');
};
const port = (value, name) => {
    if (!Number.isInteger(value) || value < 1 || value > 65535) fail(`${name} must be a port 1..65535.`);
    return value;
};

export function validateConfig(raw = {}) {
    if (!isRecord(raw)) fail('must be a JSON object.');
    const adapter = raw.adapter ?? 'none';
    if (!ADAPTERS.includes(adapter)) fail(`unknown adapter "${adapter}"; choose ${ADAPTERS.join(', ')}.`);
    for (const key of REFUSED_KEYS) if (raw[key] !== undefined) fail(`${key} is refused: the broker never listens off loopback.`);
    const address = brokerAddress(raw);
    if (raw.reserves !== undefined) {
        if (!isRecord(raw.reserves) || ![raw.reserves.gpuMiB, raw.reserves.ramMiB].every((value) => Number.isFinite(value) && value >= 0)) fail('reserves needs gpuMiB and ramMiB in MiB.');
    }
    const config = { ...raw, adapter, listenHost: address.listenHost, listenPort: address.listenPort };
    if (adapter === 'observe') {
        if (typeof raw.model !== 'string' || !raw.model) fail('observe needs the model id the text server reports.');
        config.upstream = loopbackUrl(raw.upstream, 'upstream');
        config.comfyUrl = loopbackUrl(raw.comfyUrl, 'comfyUrl');
    }
    if (adapter === 'supervise') {
        const text = raw.text;
        if (!isRecord(text)) fail('supervise needs a text section.');
        absolute(text.binary, 'text.binary');
        absolute(text.model, 'text.model');
        port(text.port, 'text.port');
        if (text.port === address.listenPort) fail('text.port must differ from listenPort.');
        if (!isRecord(text.profiles) || !Object.keys(text.profiles).length) fail('text.profiles needs at least one profile.');
        for (const [id, profile] of Object.entries(text.profiles)) {
            if (!/^[a-z0-9_-]{1,32}$/i.test(id)) fail(`profile id "${id}" must be a short word.`);
            if (!isRecord(profile) || !Array.isArray(profile.args) || profile.args.some((arg) => typeof arg !== 'string')) fail(`profile ${id} needs args as a list of strings.`);
            if (profile.args.some((arg) => ARG_REFUSED.test(arg))) fail(`profile ${id} may not set the host, port or paths; the broker binds loopback itself.`);
        }
        const defaultProfile = text.defaultProfile ?? Object.keys(text.profiles)[0];
        if (!Object.hasOwn(text.profiles, defaultProfile)) fail('text.defaultProfile must name a profile.');
        absolute(raw.stateDir, 'stateDir');
        const comfy = isRecord(raw.comfy) ? raw.comfy : {};
        const comfyUrl = loopbackUrl(comfy.url ?? 'http://127.0.0.1:8188', 'comfy.url');
        if (comfy.supervise === true) { absolute(comfy.python, 'comfy.python'); absolute(comfy.root, 'comfy.root'); }
        if (comfy.extraArgs !== undefined && (!Array.isArray(comfy.extraArgs) || comfy.extraArgs.some((arg) => typeof arg !== 'string' || ARG_REFUSED.test(arg)))) fail('comfy.extraArgs must be strings and may not set the host or port.');
        if (raw.telemetryPython !== undefined) absolute(raw.telemetryPython, 'telemetryPython');
        if (raw.modelDirs !== undefined) {
            if (!isRecord(raw.modelDirs)) fail('modelDirs maps a kind to folders.');
            for (const [kind, dirs] of Object.entries(raw.modelDirs)) if (!Array.isArray(dirs) || dirs.some((dir) => typeof dir !== 'string' || !path.isAbsolute(dir))) fail(`modelDirs.${kind} must list absolute folders.`);
        }
        config.arbiter = {
            model: text.model, binary: text.binary, backendPort: text.port, modelAlias: text.alias ?? 'local', profiles: text.profiles, defaultProfile,
            maxContext: text.maxContext ?? 32768, largeProfile: text.largeProfile, smallProfile: text.smallProfile, modelLoadMode: text.loadMode,
            reserves: raw.reserves ? { gpuMiB: raw.reserves.gpuMiB, ramMiB: raw.reserves.ramMiB } : undefined,
            comfyUrl, comfySupervise: comfy.supervise === true, comfyPython: comfy.python, comfyRoot: comfy.root, comfyExtraArgs: comfy.extraArgs ?? [],
            stateDir: raw.stateDir, modelDirs: raw.modelDirs, modelCacheRoot: raw.modelCacheRoot, telemetryPython: raw.telemetryPython,
            maxQueue: raw.maxQueue ?? 16, queueTimeoutMs: raw.queueTimeoutMs ?? 600000, keepTextResident: text.keepResident === true,
            retainBatches: raw.retainBatches === true, imageCacheMode: raw.imageCacheMode ?? 'warm', defaultImageMiB: raw.defaultImageMiB, defaultImageRamMiB: raw.defaultImageRamMiB,
        };
    }
    return config;
}
