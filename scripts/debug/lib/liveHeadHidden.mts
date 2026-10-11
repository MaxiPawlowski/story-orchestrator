import type { ConnectResult } from './connection.mts';

export async function hiddenHeadCheck(connection: ConnectResult) {
  if (!connection.session) throw new Error('A shared lane browser is required');
  const version = await (await fetch(`${connection.session.cdpEndpoint}/json/version`)).json();
  const socket = new WebSocket(version.webSocketDebuggerUrl);
  await new Promise<void>((resolve, reject) => { socket.onopen = () => resolve(); socket.onerror = () => reject(new Error('Raw CDP connection failed')); });
  let sequence = 0;
  const pending = new Map<number, { resolve(value: any): void; reject(error: Error): void; timer: ReturnType<typeof setTimeout> }>();
  socket.onmessage = (event) => {
    const reply = JSON.parse(String(event.data)), waiter = pending.get(reply.id);
    if (!waiter) return;
    clearTimeout(waiter.timer); pending.delete(reply.id);
    if (reply.error) waiter.reject(new Error(reply.error.message)); else waiter.resolve(reply.result);
  };
  const send = (method: string, params: Record<string, unknown> = {}, sessionId?: string): Promise<any> => new Promise((resolve, reject) => {
    const id = ++sequence;
    pending.set(id, { resolve, reject, timer: setTimeout(() => { pending.delete(id); reject(new Error(`CDP ${method} timed out`)); }, 10_000) });
    socket.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
  });
  let other: string | null = null;
  let target: string | null = null;
  try {
    const targets = await send('Target.getTargets');
    target = targets.targetInfos.find((entry: any) => entry.type === 'page' && entry.url === connection.page.url())?.targetId;
    if (!target) throw new Error('The synthetic lane tab was not found');
    const { sessionId } = await send('Target.attachToTarget', { targetId: target, flatten: true });
    await connection.browser.close();
    other = (await send('Target.createTarget', { url: 'about:blank', newWindow: false })).targetId;
    await send('Target.activateTarget', { targetId: other });
    const sample = async () => (await send('Runtime.evaluate', { expression: '({hidden:document.hidden,draws:globalThis.__lh.draws})', returnByValue: true }, sessionId)).result.value;
    let before = await sample();
    const deadline = Date.now() + 5000;
    while (!before.hidden && Date.now() < deadline) { await new Promise((done) => setTimeout(done, 100)); before = await sample(); }
    await new Promise((done) => setTimeout(done, 1500));
    const after = await sample();
    return { before, after, ok: before.hidden && after.hidden && before.draws === after.draws };
  } finally {
    if (other) await send('Target.closeTarget', { targetId: other }).catch(() => undefined);
    if (target) await send('Target.activateTarget', { targetId: target }).catch(() => undefined);
    socket.close();
  }
}
