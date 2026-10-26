const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export async function stopIdleComfy({ child: getChild, busy, queue, kill, timeoutMs = 15000, settleMs = 0, log = () => {} }, { shortMiB = 0 } = {}) {
    const child = getChild();
    if (!child || busy()) return { stopped: false, reason: child ? 'busy' : 'not-owned' };
    let pending;
    try { pending = await queue(); } catch (error) { return { stopped: false, reason: `queue unreadable: ${error.message}` }; }
    if (pending.queue_running?.length || pending.queue_pending?.length) return { stopped: false, reason: 'queue' };
    if (settleMs > 0) {
        await pause(settleMs);
        try { pending = await queue(); } catch (error) { return { stopped: false, reason: `queue unreadable: ${error.message}` }; }
        if (pending.queue_running?.length || pending.queue_pending?.length) return { stopped: false, reason: 'queue' };
    }
    if (getChild() !== child || busy()) return { stopped: false, reason: 'changed' };
    if (child.exitCode !== null && child.exitCode !== undefined) return { stopped: true, pid: child.pid };
    const ended = new Promise((resolve) => child.once('exit', () => resolve(true)));
    try { await kill(child); } catch (error) { return { stopped: false, reason: `kill failed: ${error.message}` }; }
    let timer;
    const exited = await Promise.race([ended, new Promise((resolve) => { timer = setTimeout(() => resolve(false), timeoutMs); })]);
    clearTimeout(timer);
    if (!exited) { log(`text reclaim: ComfyUI (pid ${child.pid}) did not exit within ${Math.round(timeoutMs / 1000)}s; not counted as freed.`); return { stopped: false, reason: 'no-exit', pid: child.pid }; }
    log(`text reclaim: stopped the idle owned ComfyUI (pid ${child.pid}) because text was ${Math.round(shortMiB)} MiB short of the GPU reserve; the next image starts it again.`);
    return { stopped: true, pid: child.pid };
}

export async function freeIdleComfy({ child: getChild, busy, queue, free, emptyHostCache = null, measure, reserveMiB, waitMs = 5000, pollMs = 500, log = () => {} }, { shortMiB = 0 } = {}) {
    const child = getChild();
    if (!child || busy()) return { freed: false, reason: child ? 'busy' : 'not-owned' };
    let pending;
    try { pending = await queue(); } catch (error) { return { freed: false, reason: `queue unreadable: ${error.message}` }; }
    if (pending.queue_running?.length || pending.queue_pending?.length) return { freed: false, reason: 'queue' };
    try { await free(); } catch (error) { return { freed: false, reason: `free failed: ${error.message}` }; }
    if (emptyHostCache) { try { await emptyHostCache(); } catch (error) { log(`text reclaim: host-cache release failed: ${error.message}`); } }
    const deadline = Date.now() + waitMs;
    let freeMiB = null;
    while (true) {
        if (getChild() !== child || busy()) return { freed: false, reason: 'changed', freeMiB };
        try { freeMiB = (await measure())?.gpus?.[0]?.freeMiB ?? null; } catch { freeMiB = null; }
        if (Number.isFinite(freeMiB) && freeMiB >= reserveMiB) {
            log(`text reclaim: asked the idle owned ComfyUI (pid ${child.pid}) to free its models; ${Math.round(freeMiB)} MiB free now, text was ${Math.round(shortMiB)} MiB short. ComfyUI keeps running.`);
            return { freed: true, freeMiB: Math.round(freeMiB) };
        }
        if (Date.now() >= deadline) return { freed: false, reason: 'still-short', freeMiB: Number.isFinite(freeMiB) ? Math.round(freeMiB) : null };
        await pause(pollMs);
    }
}
