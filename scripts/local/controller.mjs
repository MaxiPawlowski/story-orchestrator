import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { createArbiter, brokerBuild } from '../../server-plugin/story-orchestrator-gpu/broker/arbiter.mjs';
import { createGateway } from '../../server-plugin/story-orchestrator-gpu/broker/gateway.mjs';
import { runtimeMemoryProfile } from '../../server-plugin/story-orchestrator-gpu/broker/runtimeIdentity.mjs';
import { controllerStatus, withControllerDefaults } from '../../server-plugin/story-orchestrator-gpu/broker/controllerStatus.mjs';

const configFile = process.argv[2];
if (!configFile) throw new Error('Usage: node scripts/local/controller.mjs <config.json>');
const guard = new URL('./comfyMemoryGuard/__init__.py', import.meta.url);
const config = withControllerDefaults(JSON.parse(await fs.readFile(configFile, 'utf8')));
const arbiterConfig = { ...config, comfySupervise: true, telemetryPython: config.telemetryPython ?? config.comfyPython,
    comfyExtraArgs: ['--cache-ram', '8', '--reserve-vram', '2', ...(config.comfyExtraArgs ?? [])] };
const controllerBuild = await brokerBuild([guard]);
const comfyGet = async (route) => {
    const response = await fetch(`${config.comfyUrl}${route}`, { signal: AbortSignal.timeout(config.comfyRequestTimeoutMs ?? 60000) });
    if (!response.ok) throw new Error(`ComfyUI ${route} answered ${response.status}`);
    return response.json();
};
const arbiter = createArbiter(arbiterConfig, {
    runtime: async () => {
        const stats = await comfyGet('/system_stats');
        const code = createHash('sha256');
        for (const name of ['main.py', 'comfy/model_management.py', 'comfy/model_patcher.py']) code.update(await fs.readFile(path.join(config.comfyRoot, name)));
        code.update(await fs.readFile(guard));
        return runtimeMemoryProfile(stats.system, code.digest('hex'), { hostCacheRelease: 'pressure-only-public-api-v1', cacheMode: config.imageCacheMode ?? 'warm',
            warmReleaseMs: config.imageWarmReleaseMs ?? 5000 });
    },
});
await arbiter.start();
const status = async () => controllerStatus({ config: arbiterConfig, scheduler: arbiter.scheduler.status(), imageCache: arbiter.imageCache,
    telemetry: (await arbiter.status({ fresh: true })).telemetry, controllerBuild, pid: process.pid, configFile });
const gateway = createGateway({ arbiter, config: arbiterConfig, allowOrigin: /^http:\/\/(127\.0\.0\.1|localhost):(8000|81\d\d)$/,
    extraGet: { '/': status, '/status': status, '/health': status, '/measurement': async () => arbiter.scheduler.lastMeasurement ?? null },
    controls: {
        stop: async () => {
            await arbiter.scheduler.exclusive(async () => {
                if (arbiter.ownedChildren().length) {
                    const queue = await comfyGet('/queue').catch(() => ({}));
                    if (queue.queue_running?.length || queue.queue_pending?.length) throw new Error('ComfyUI has an existing job; finish it before stopping the controller.');
                }
            });
            await arbiter.stop();
            setTimeout(() => { void gateway.close().finally(() => process.exit(0)); }, 50);
        },
    } });
process.on('SIGTERM', () => { void arbiter.stop().finally(() => { void gateway.close(); process.exit(0); }); });
await gateway.listen(config.gatewayPort, '127.0.0.1');
console.log(`Local residency gateway listening on 127.0.0.1:${config.gatewayPort}`);
