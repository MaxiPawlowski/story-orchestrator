// v2.5 plan 08 live gates G-L1/G-L2/G-L4/G-L5 helpers (test-only; loaded by `inject_script`). LANES ONLY.
// Reads the scan the way ST builds it (world-info.js getSortedEntries, which emits ENTRIES_LOADED, so the
// product's handler runs), captures WORLD_INFO_ACTIVATED per loud generation, and creates or deletes only
// books whose name starts with MARKER. Host bindings (chat slot, persona book, a card's book) are changed in
// memory only and put back by restoreBindings(); nothing here saves a card or the settings.
(() => {
  const MARKER = 'SO-V25-08';
  const ctx = () => globalThis.SillyTavern.getContext();
  const rt = () => globalThis.storyOrchestratorRuntime;
  const wi = () => import('/scripts/world-info.js');
  const saved = { slot: undefined, persona: undefined, cards: new Map() };
  let capture = null;
  const keyOf = (entry) => `${String(entry.world).toLowerCase()}.${entry.uid}`;
  globalThis.__soV2508 = {
    MARKER,
    requireScan() {
      const gating = globalThis.storyOrchestratorScanGating;
      if (!gating?.active?.()) throw new Error('per-chat (scan) gating is not active on this lane; switch it on through the product confirm first (plan 01 G-series prep)');
      return true;
    },
    requireFile() {
      if (globalThis.storyOrchestratorScanGating?.active?.()) throw new Error('this leg needs file mode; switch gating back to file first');
      return true;
    },
    async scanView() {
      const module = await wi();
      return module.getSortedEntries();
    },
    async mirrorCount(name) {
      const view = await this.scanView();
      return view.filter((entry) => String(entry.world).toLowerCase() === String(name).toLowerCase()).length;
    },
    async mirrorComments(name) {
      const view = await this.scanView();
      return view.filter((entry) => String(entry.world).toLowerCase() === String(name).toLowerCase()).map((entry) => entry.comment);
    },
    async bookSoComments(name) {
      const data = await ctx().loadWorldInfo(name);
      return Object.values(data?.entries ?? {}).filter((entry) => String(entry.comment ?? '').startsWith('so_') && entry.disable !== true).map((entry) => entry.comment);
    },
    startCapture() {
      capture = { generations: [], current: [] };
      capture.onActivated = (entries) => { capture.current.push(...(entries ?? []).map((entry) => ({ world: entry.world, uid: entry.uid, comment: entry.comment }))); };
      capture.onEnded = () => { capture.generations.push(capture.current); capture.current = []; };
      ctx().eventSource.on(ctx().eventTypes.WORLD_INFO_ACTIVATED, capture.onActivated);
      ctx().eventSource.on(ctx().eventTypes.GENERATION_ENDED, capture.onEnded);
      return true;
    },
    stopCapture() {
      if (!capture) return { generations: [] };
      ctx().eventSource.removeListener(ctx().eventTypes.WORLD_INFO_ACTIVATED, capture.onActivated);
      ctx().eventSource.removeListener(ctx().eventTypes.GENERATION_ENDED, capture.onEnded);
      if (capture.current.length) capture.generations.push(capture.current);
      const out = { generations: capture.generations };
      capture = null;
      return out;
    },
    lastGeneration() {
      if (!capture) throw new Error('startCapture() first');
      return capture.current.length ? capture.current : capture.generations[capture.generations.length - 1] ?? [];
    },
    bindChatSlot(name) {
      const key = 'world_info';
      if (saved.slot === undefined) saved.slot = { key, value: ctx().chatMetadata[key] };
      if (name) ctx().chatMetadata[key] = name;
      else delete ctx().chatMetadata[key];
      return ctx().chatMetadata[key] ?? '';
    },
    bindPersona(name) {
      const power = ctx().powerUserSettings;
      if (saved.persona === undefined) saved.persona = power.persona_description_lorebook ?? '';
      power.persona_description_lorebook = name;
      return power.persona_description_lorebook;
    },
    bindCard(memberName, name) {
      const index = ctx().characters.findIndex((character) => character.name === memberName);
      if (index < 0) throw new Error(`no character named ${memberName}`);
      const character = ctx().characters[index];
      character.data = character.data ?? {};
      character.data.extensions = character.data.extensions ?? {};
      if (!saved.cards.has(index)) saved.cards.set(index, character.data.extensions.world);
      character.data.extensions.world = name;
      return index;
    },
    restoreBindings() {
      if (saved.slot !== undefined) {
        if (saved.slot.value === undefined) delete ctx().chatMetadata[saved.slot.key];
        else ctx().chatMetadata[saved.slot.key] = saved.slot.value;
      }
      if (saved.persona !== undefined) ctx().powerUserSettings.persona_description_lorebook = saved.persona;
      for (const [index, world] of saved.cards) {
        const extensions = ctx().characters[index]?.data?.extensions;
        if (!extensions) continue;
        if (world === undefined) delete extensions.world;
        else extensions.world = world;
      }
      saved.slot = undefined;
      saved.persona = undefined;
      saved.cards.clear();
      return true;
    },
    async createBook(name, entries) {
      if (!name.startsWith(MARKER)) throw new Error(`only ${MARKER} books are created here`);
      const module = await wi();
      if (!module.world_names.includes(name)) await module.createNewWorldInfo(name);
      const data = { entries: {} };
      entries.forEach((entry, uid) => {
        data.entries[uid] = {
          uid, key: entry.key ?? [], keysecondary: [], comment: entry.comment, content: entry.content, constant: Boolean(entry.constant),
          selective: false, selectiveLogic: 0, addMemo: true, order: 100, position: 0, disable: Boolean(entry.disable), excludeRecursion: false,
          preventRecursion: false, delayUntilRecursion: false, probability: 100, useProbability: true, depth: 4, group: '', groupOverride: false,
          groupWeight: 100, scanDepth: null, caseSensitive: null, matchWholeWords: null, useGroupScoring: null, automationId: '', role: null,
          sticky: entry.sticky ?? 0, cooldown: entry.cooldown ?? 0, delay: entry.delay ?? 0, displayIndex: uid,
        };
      });
      await module.saveWorldInfo(name, data, true);
      await module.updateWorldInfoList();
      return Object.keys(data.entries).length;
    },
    async deleteBook(name) {
      if (!name.startsWith(MARKER)) throw new Error(`only ${MARKER} books are deleted here`);
      const module = await wi();
      await module.updateWorldInfoList();
      if (!module.world_names.includes(name)) return false;
      return module.deleteWorldInfo(name);
    },
    async selectGlobal(name, on) {
      const quoted = JSON.stringify(name);
      await ctx().executeSlashCommandsWithOptions(`/world silent=true state=${on ? 'on' : 'off'} ${quoted}`);
      return (await wi()).selected_world_info.includes(name);
    },
    requirements() {
      return rt().getSnapshot().requirements;
    },
    recall(activated, needed) {
      const fired = new Set(activated.map(keyOf));
      const hits = needed.filter((key) => fired.has(String(key).toLowerCase()));
      return { needed: needed.length, hit: hits.length, noise: activated.filter((entry) => !needed.map((key) => String(key).toLowerCase()).includes(keyOf(entry))).length };
    },
  };
})();
