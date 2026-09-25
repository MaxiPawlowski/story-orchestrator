// v2.4 plan 05 (T20 WI shapes, test-only; never installed). Two things another extension can do to
// World Info that this extension must see rather than assume away: (1) splice a book out of the
// WORLDINFO_ENTRIES_LOADED arrays (05-H2), which hides it from the model; (2) run its own DRY
// checkWorldInfo between our WORLDINFO_FORCE_ACTIVATE and the real scan, which clears pending forces
// (05-H7, world-info.js:418,5275). Loaded by the `inject_script` verb; `off()` removes both.
(() => {
  if (globalThis.__soWiForeign?.off) globalThis.__soWiForeign.off();
  const ctx = () => globalThis.SillyTavern.getContext();
  const state = { spliced: 0, dryScans: 0, dryErrors: [], listeners: [] };
  const on = (key, listener) => {
    const name = ctx().eventTypes[key];
    ctx().eventSource.on(name, listener);
    state.listeners.push([name, listener]);
  };
  globalThis.__soWiForeign = {
    state,
    splice(book) {
      const wanted = String(book).trim().toLowerCase();
      on('WORLDINFO_ENTRIES_LOADED', (payload) => {
        for (const key of ['globalLore', 'characterLore', 'chatLore', 'personaLore']) {
          const list = payload?.[key];
          if (!Array.isArray(list)) continue;
          for (let index = list.length - 1; index >= 0; index -= 1) {
            if (String(list[index]?.world ?? '').trim().toLowerCase() === wanted) {
              list.splice(index, 1);
              state.spliced += 1;
            }
          }
        }
      });
      return { splicing: book };
    },
    dryScanAfterCommands() {
      on('GENERATION_AFTER_COMMANDS', async (type, params, dryRun) => {
        if (dryRun) return;
        try {
          const chat = (ctx().chat ?? []).map((message) => String(message?.mes ?? '')).reverse();
          await ctx().getWorldInfoPrompt(chat, 8192, true, { personaDescription: '', characterDescription: '', characterPersonality: '', characterDepthPrompt: '', scenario: '', creatorNotes: '', trigger: type ?? 'normal' });
          state.dryScans += 1;
        } catch (error) {
          state.dryErrors.push(error instanceof Error ? error.message : String(error));
        }
      });
      return { dryScanning: true };
    },
    off() {
      for (const [name, listener] of state.listeners.splice(0)) ctx().eventSource.removeListener(name, listener);
      return { removed: true };
    },
  };
  return { installed: true };
})();
