export function createControllerStop({ scheduler, ownedChildren, comfyQueue, performance, stopArbiter, close, exit = (code) => process.exit(code), graceMs = 15000, schedule = (run) => setTimeout(run, 50), afterStop = async () => {} }) {
    return async function stop(body = {}) {
        const force = body?.force === true;
        if (!force && ownedChildren().length) {
            const queue = await comfyQueue().catch(() => ({}));
            if (queue.queue_running?.length || queue.queue_pending?.length) throw new Error('ComfyUI has an existing job; finish it before stopping the controller, or stop with --force.');
        }
        const drained = await scheduler.drainForStop(force ? 0 : graceMs);
        performance.stop();
        await stopArbiter();
        await afterStop();
        schedule(() => { void Promise.resolve().then(close).finally(() => exit(0)); });
        return drained;
    };
}
