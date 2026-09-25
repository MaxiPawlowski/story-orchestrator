// v2.4 plan 05 T13 spike, the legs the design block left manual (S4, S7, S9; S1c is finished by hand
// after this fixture because it needs the extension disabled). Test-only, loaded by `inject_script`
// AFTER t13-spike.js, whose helpers it reuses. The record lives in localStorage `so-t13-manual` so it
// survives the mode-switch reloads. Every book it touches carries the SO-T13 marker.
(() => {
  const ctx = () => globalThis.SillyTavern.getContext();
  const rt = () => globalThis.storyOrchestratorRuntime;
  const S = () => {
    if (!globalThis.__soT13) throw new Error('t13-spike.js is not injected');
    return globalThis.__soT13;
  };
  const BOOK = 'SO-T13 Xentar';
  const load = () => JSON.parse(localStorage.getItem('so-t13-manual') ?? '{}');
  const store = (record) => localStorage.setItem('so-t13-manual', JSON.stringify(record));
  const patch = (key, value) => { const record = load(); record[key] = value; store(record); return value; };
  const wi = () => import('/scripts/world-info.js');
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const bookEntries = async () => (await (await wi()).getSortedEntries()).filter((entry) => String(entry.world).trim().toLowerCase() === BOOK.toLowerCase());
  const byComment = (entries, comment) => entries.find((entry) => String(entry.comment ?? '').trim() === comment) ?? null;
  const collectionId = async () => `world_${(await import('/scripts/utils.js')).getStringHash(BOOK)}`;
  const forcedLog = [];
  let forceListener = null;
  let s7Listener = null;
  const firedIn = (slot) => [...new Set(slot.scans.filter((scan) => scan.loud).flatMap((scan) => scan.entries.filter((entry) => String(entry.world).trim().toLowerCase() === BOOK.toLowerCase()).map((entry) => entry.comment)))];

  globalThis.__soT13m = {
    load,
    async setup() {
      const made = await rt().applyProvisioning({ kind: 'createStoryLorebook', name: BOOK }, { requirements: { lorebooks: [] } });
      if (!made.ok && !made.message.includes('already exists')) throw new Error(`marker book: ${made.message}`);
      await S().copyExampleBook(BOOK);
      const data = await S().serverBook(BOOK);
      const set = (comment, field, value) => {
        const entry = Object.values(data.entries).find((row) => String(row.comment).trim() === comment);
        if (!entry) throw new Error(`no ${comment} in the copy`);
        if (!(field in entry)) throw new Error(`${comment} has no ${field} key; adding one would change its hash (05-H5)`);
        entry[field] = value;
      };
      set('CP1 - Scenario', 'sticky', 3);
      set('CP4 - Sphinx', 'vectorized', true);
      set('CP2 - Scenario', 'vectorized', true);
      await S().writeBook(BOOK, data);
      store({ chats: {}, startedAt: new Date().toISOString() });
      if (!forceListener) {
        forceListener = (entries) => { forcedLog.push({ at: Date.now(), comments: (entries ?? []).map((entry) => String(entry?.comment ?? `${entry?.world}.${entry?.uid}`)) }); };
        ctx().eventSource.on(ctx().eventTypes.WORLDINFO_FORCE_ACTIVATE, forceListener);
      }
      return { book: BOOK, sticky: 'CP1 - Scenario = 3', vectorized: ['CP4 - Sphinx', 'CP2 - Scenario'] };
    },
    watchForces() {
      if (!forceListener) {
        forceListener = (entries) => { forcedLog.push({ at: Date.now(), comments: (entries ?? []).map((entry) => String(entry?.comment ?? `${entry?.world}.${entry?.uid}`)) }); };
        ctx().eventSource.on(ctx().eventTypes.WORLDINFO_FORCE_ACTIVATE, forceListener);
      }
      return { watching: true };
    },
    here(name) {
      const record = load();
      record.chats[name] = S().here();
      store(record);
      return record.chats[name];
    },
    async goto(name, storyId) {
      return S().goto(load().chats[name], storyId);
    },
    slots() {
      return globalThis.storyOrchestratorLoreEvidence.slotsForChat().length;
    },
    async settled(before, timeoutMs = 90000) {
      const started = Date.now();
      while (globalThis.storyOrchestratorLoreEvidence.slotsForChat().length <= before) {
        if (Date.now() - started > timeoutMs) throw new Error(`no evidence slot settled for the reply (still ${before})`);
        await sleep(500);
      }
      const slot = globalThis.storyOrchestratorLoreEvidence.slotsForChat().at(-1);
      return { fired: firedIn(slot), rendered: slot.rendered, loudScans: slot.scans.filter((scan) => scan.loud).length };
    },
    async stickyProbe(label) {
      const entries = await bookEntries();
      const entry = byComment(entries, 'CP1 - Scenario');
      const sticky = ctx().chatMetadata?.timedWorldInfo?.sticky ?? {};
      const key = entry ? `${entry.world}.${entry.uid}` : null;
      const record = key ? sticky[key] ?? null : null;
      const row = { label, mode: rt().getGlobalSettings().worldInfo.gatingMode, chatLength: ctx().chat.length, scanHash: entry?.hash ?? null, scanDisable: entry?.disable ?? null, sticky: record, hashMatches: record ? String(record.hash) === String(entry?.hash) : null };
      const all = load();
      all.S9 = [...(all.S9 ?? []), row];
      store(all);
      return row;
    },
    async vectorStart(mode) {
      const id = await collectionId();
      const purge = await fetch('/api/vector/purge', { method: 'POST', headers: ctx().getRequestHeaders(), body: JSON.stringify({ collectionId: id, source: ctx().extensionSettings.vectors?.source }) });
      S().arm();
      S().reset();
      forcedLog.length = 0;
      return patch(`S4start_${mode}`, { mode, collectionId: id, purged: purge.ok, vectors: { enabled_world_info: ctx().extensionSettings.vectors?.enabled_world_info, source: ctx().extensionSettings.vectors?.source } });
    },
    async vectorTurn(mode, leg, before) {
      const slot = await this.settled(before);
      const record = load();
      const key = `S4_${mode}`;
      record[key] = [...(record[key] ?? []), { leg, fired: slot.fired.filter((comment) => /^CP/.test(comment)), forcedByVectors: forcedLog.splice(0).flatMap((row) => row.comments).filter((comment) => /^CP/.test(comment)), counters: { insert: S().counters.vectorInsert, delete: S().counters.vectorDelete } }];
      store(record);
      return record[key].at(-1);
    },
    vectorResult(mode) {
      const record = load();
      const legs = record[`S4_${mode}`] ?? [];
      const onLegs = legs.filter((leg) => leg.leg.startsWith('A'));
      const offLeak = legs.filter((leg) => leg.leg.startsWith('A') && (leg.fired.includes('CP2 - Scenario') || leg.forcedByVectors.includes('CP2 - Scenario')));
      const result = { mode, insert: S().counters.vectorInsert, delete: S().counters.vectorDelete, onFired: onLegs.every((leg) => leg.fired.includes('CP4 - Sphinx')), offLeaked: offLeak.length, legs: legs.length };
      patch(`S4result_${mode}`, result);
      return result;
    },
    async s7Arm() {
      const data = await S().serverBook(BOOK);
      const magic = Object.values(data.entries).find((row) => String(row.comment).trim() === 'General - Magic');
      const control = Object.values(data.entries).find((row) => String(row.comment).trim() === 'Places - Guild of Adventurers');
      const restingMagic = magic.disable;
      await S().setDisabled(BOOK, ['General - Magic'], false);
      const view = await bookEntries();
      const candidates = view.filter((entry) => !entry.disable && !entry.constant && String(entry.content ?? '').trim()).map((entry) => String(entry.comment).trim());
      const magicView = byComment(view, 'General - Magic');
      s7Listener = async (_type, _params, dryRun) => {
        if (dryRun) return;
        await ctx().eventSource.emit(ctx().eventTypes.WORLDINFO_FORCE_ACTIVATE, [
          { world: magicView.world, uid: magicView.uid, comment: magicView.comment, content: magicView.content, key: magicView.key },
          { world: magicView.world, uid: control.uid, comment: control.comment, content: control.content, key: control.key },
        ]);
      };
      ctx().eventSource.on(ctx().eventTypes.GENERATION_AFTER_COMMANDS, s7Listener);
      return patch('S7arm', { restingMagicOnDisk: restingMagic, adversarial: 'General - Magic set enabled on disk', magicInScanView: { disable: magicView?.disable ?? null }, candidates, magicIsCandidate: candidates.includes('General - Magic'), controlIsCandidate: candidates.includes('Places - Guild of Adventurers') });
    },
    async s7Result(before) {
      if (s7Listener) ctx().eventSource.removeListener(ctx().eventTypes.GENERATION_AFTER_COMMANDS, s7Listener);
      s7Listener = null;
      const slot = await this.settled(before);
      const lore = rt().getSnapshot().loreForced;
      const picks = Object.keys(lore?.p ?? {}).filter((key) => key !== 'trigger');
      const result = { fired: slot.fired, magicLanded: slot.fired.includes('General - Magic'), controlLanded: slot.fired.includes('Places - Guild of Adventurers'), judgePicks: picks, judgeQuestions: lore?.questionCount ?? null, judgeFallback: lore?.fallback ?? null, magicPicked: picks.includes('General - Magic') };
      await S().setDisabled(BOOK, ['General - Magic'], true);
      return patch('S7', result);
    },
    async s1cPrepare() {
      const data = await S().serverBook(BOOK);
      const normalized = rt().getGlobalSettings().worldInfo.normalized[BOOK] ?? [];
      const enabledOnDisk = Object.values(data.entries).filter((row) => normalized.includes(String(row.comment).trim()) && row.disable !== true).map((row) => row.comment);
      return patch('S1cPrepare', { normalized, enabledOnDisk });
    },
    report() {
      return load();
    },
    off() {
      if (forceListener) ctx().eventSource.removeListener(ctx().eventTypes.WORLDINFO_FORCE_ACTIVATE, forceListener);
      forceListener = null;
      if (s7Listener) ctx().eventSource.removeListener(ctx().eventTypes.GENERATION_AFTER_COMMANDS, s7Listener);
      s7Listener = null;
      if (globalThis.__soT13?.disarm) globalThis.__soT13.disarm();
      return { off: true };
    },
  };
  return { installed: true };
})();
