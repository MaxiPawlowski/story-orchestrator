(() => {
  const g = globalThis;
  const ctx = () => g.SillyTavern.getContext();
  const parse = (input) => {
    const match = String(input ?? '').match(/(\/?)(.+)\1([a-z]*)/i);
    return match ? new RegExp(match[2], match[3]) : null;
  };
  if (g.__soPostProcessor) g.__soPostProcessor.disarm();
  const state = { config: null, listener: null, rewrites: [], running: new Set(), timers: new Map(), seen: new Set() };
  const sleep = (ms) => new Promise((resolve) => {
    const timer = setTimeout(() => { state.timers.delete(timer); resolve(); }, ms);
    state.timers.set(timer, resolve);
  });
  const generating = () => typeof document !== 'undefined' && document.body?.dataset?.generating === 'true';
  const committed = (id) => (g.storyOrchestratorRuntime?.getEngineState?.()?.lastMessageId ?? -1) >= id;
  const transform = (config, text) => {
    const find = parse(config.findRegex);
    return find ? text.replace(find, config.replaceString ?? '') : text;
  };
  const write = (id, text) => {
    const c = ctx();
    const row = c.chat[id];
    row.mes = text;
    if (Array.isArray(row.swipes)) row.swipes[row.swipe_id ?? 0] = text;
    c.updateMessageBlock?.(id, row);
    c.eventSource.emit(c.eventTypes.MESSAGE_EDITED, id);
  };
  const settleRound = async (config, id) => {
    const started = Date.now();
    let quietSince = null;
    while (state.config === config) {
      const ready = !generating() && (!config.afterCommit || committed(id));
      quietSince = ready ? quietSince ?? Date.now() : null;
      if (quietSince !== null && Date.now() - quietSince >= config.quietMs) return true;
      if (Date.now() - started > config.timeoutMs) return false;
      await sleep(config.pollMs);
    }
    return false;
  };
  const rewrite = async (config, id) => {
    const entry = { id, armedAt: Date.now(), burst: config.burst, texts: [] };
    state.rewrites.push(entry);
    if (!(await settleRound(config, id))) {
      entry.skipped = 'the round did not settle';
      return;
    }
    await sleep(config.delayMs);
    const row = ctx().chat[id];
    if (state.config !== config || !row || row.is_user || id !== ctx().chat.length - 1) {
      entry.skipped = 'no longer the newest reply';
      return;
    }
    entry.before = row.mes;
    entry.committedBefore = committed(id);
    entry.activeBefore = g.storyOrchestratorRuntime?.getEngineState?.()?.activeCheckpointId ?? null;
    const polished = transform(config, row.mes);
    const final = config.append ? `${polished.trimEnd()} ${config.append}` : polished;
    const first = config.appendFirst ? `${polished.trimEnd()} ${config.appendFirst}` : polished;
    const texts = config.burst === 'double' ? [final, final] : config.burst === 'late' ? [first, final] : [final];
    for (const [index, text] of texts.entries()) {
      if (index > 0 && config.burst === 'late') await sleep(config.lateMs);
      if (state.config !== config) {
        entry.skipped = 'disarmed';
        return;
      }
      write(id, text);
      entry.texts.push(text);
      if (config.burst === 'late' || index === texts.length - 1) await ctx().saveChat();
    }
    entry.changed = entry.before !== final;
    entry.settledAt = Date.now();
  };
  const onRendered = (messageId, type) => {
    const config = state.config;
    if (!config || type === 'first_message' || type === 'extension') return;
    const id = Number(messageId);
    const row = ctx().chat[id];
    if (!Number.isInteger(id) || !row || row.is_user) return;
    const key = `${id}:${row.swipe_id ?? 0}:${row.send_date ?? ''}`;
    if (state.seen.has(key)) return;
    state.seen.add(key);
    const run = rewrite(config, id);
    state.running.add(run);
    void run.finally(() => state.running.delete(run));
  };
  globalThis.__soPostProcessor = {
    rewrites: state.rewrites,
    installRegex(script) {
      const c = ctx();
      const list = Array.isArray(c.extensionSettings.regex) ? c.extensionSettings.regex : (c.extensionSettings.regex = []);
      const existing = list.find((entry) => entry?.scriptName === script.scriptName);
      if (existing) return { installed: false, id: existing.id, scriptName: script.scriptName };
      const id = g.crypto?.randomUUID?.() ?? `${script.id}-${Date.now()}`;
      list.push({ ...script, id });
      return { installed: true, id, scriptName: script.scriptName };
    },
    removeRegex(prefix) {
      const c = ctx();
      const list = Array.isArray(c.extensionSettings.regex) ? c.extensionSettings.regex : [];
      const marked = (entry) => String(entry?.scriptName ?? '').toLowerCase().startsWith(String(prefix).toLowerCase());
      const removed = list.filter(marked).map((entry) => entry.scriptName);
      if (removed.length) c.extensionSettings.regex = list.filter((entry) => !marked(entry));
      return { removed };
    },
    arm(options = {}) {
      this.disarm();
      const config = { findRegex: '', replaceString: '', burst: 'single', append: '', appendFirst: '', delayMs: 500, lateMs: 1500, quietMs: 1000, pollMs: 100, timeoutMs: 120000, afterCommit: true, ...options };
      if (!['single', 'double', 'late'].includes(config.burst)) throw new Error(`unknown burst "${config.burst}" (single, double, late)`);
      state.config = config;
      state.listener = onRendered;
      const c = ctx();
      c.eventSource.on(c.eventTypes.CHARACTER_MESSAGE_RENDERED, onRendered);
      return { armed: true, burst: config.burst, afterCommit: config.afterCommit, append: config.append, appendFirst: config.appendFirst, delayMs: config.delayMs, lateMs: config.lateMs };
    },
    async settled() {
      await Promise.all([...state.running]);
      return state.rewrites.slice();
    },
    disarm() {
      state.config = null;
      if (state.listener) {
        const c = ctx();
        c.eventSource.removeListener(c.eventTypes.CHARACTER_MESSAGE_RENDERED, state.listener);
      }
      state.listener = null;
      const sleeping = [...state.timers.entries()];
      state.timers.clear();
      sleeping.forEach(([timer, resolve]) => { clearTimeout(timer); resolve(); });
      return { disarmed: true };
    },
  };
  return { installed: true };
})();
