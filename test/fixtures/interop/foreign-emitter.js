// v2.4 plan 01 (X10, test-only; never installed). Reproduces the shape Guided Generations emits
// (research clone 64456d4, scripts/utils/llmClient.js:565-572): GENERATION_STARTED / ENDED / STOPPED
// with ONE argument, a `{source}` object, around its own request. ST's own shapes are
// STARTED(type, params, dryRun) and ENDED(chat.length) (host-facts 01-H5, 01-H7), so a listener that
// trusts the event name alone treats this as a real turn. Loaded by the `inject_script` verb.
(() => {
  const emit = async (name, ...args) => {
    const ctx = globalThis.SillyTavern.getContext();
    await ctx.eventSource.emit(ctx.eventTypes[name], ...args);
  };
  globalThis.__soForeignEmitter = {
    source: 'guided-generations',
    /** STARTED({source}), an optional real request, then ENDED({source}) — or STOPPED({source}). */
    async run({ request = null, stopped = false } = {}) {
      const payload = { source: this.source };
      await emit('GENERATION_STARTED', payload);
      let answer = null;
      if (request) answer = await request();
      await emit(stopped ? 'GENERATION_STOPPED' : 'GENERATION_ENDED', payload);
      return { emitted: ['GENERATION_STARTED', stopped ? 'GENERATION_STOPPED' : 'GENERATION_ENDED'], answered: answer !== null };
    },
    /** An ST-shaped STARTED that is a dry run and is never closed (itemization, token counting). */
    async dryUnpaired() {
      await emit('GENERATION_STARTED', 'normal', {}, true);
      return { emitted: ['GENERATION_STARTED(dryRun)'] };
    },
  };
  return { installed: true };
})();
