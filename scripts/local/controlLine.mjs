const busyText = (interrupted = {}) => [
    interrupted.activeText ? `${interrupted.activeText} reply cut off` : null,
    interrupted.restoring ? 'a text load was running' : null,
    interrupted.imageLease || interrupted.imagePending || interrupted.imageQueued ? 'an image lease was stuck' : null,
].filter(Boolean).join(', ');

export function controlLine(action, data) {
    const result = action === 'stop' ? data : data.unload;
    if (action === 'stop' && data.stopped) return result?.forced ? `stop: stopped after the wait ran out (${busyText(result.interrupted) || 'work still active'})` : 'stop: stopped';
    if (action === 'unload' && result?.forced) return `unload: ${data.phase ?? 'done'} (forced${busyText(result.interrupted) ? `; ${busyText(result.interrupted)}` : ''})`;
    return `${action}: ${data.phase ?? 'done'}`;
}

export function controlError(action, data, force = false) {
    const text = JSON.stringify(data);
    if (action === 'unload' && !force && /active work/.test(data?.error ?? '')) return `${text} Text or an image is still active; if the queue is stuck, run: node scripts/local/cli.mjs unload --force`;
    if (action === 'stop' && !force && /existing job/.test(data?.error ?? '')) return `${text} To stop anyway (the ComfyUI job is lost), run: node scripts/local/cli.mjs stop --force`;
    return text;
}
