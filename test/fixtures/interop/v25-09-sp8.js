(() => {
  const MARKER = 'SO-V25-09';
  const SPAN = /\{\{\/\/\s*so:(auto|protect|end)\s*\}\}/gi;
  const REFUSED = /touches protected text|adds a curator marker/;
  const ctx = () => globalThis.SillyTavern.getContext();
  const rt = () => globalThis.storyOrchestratorRuntime;
  const wi = () => import('/scripts/world-info.js');
  const spansOf = (content) => {
    const text = String(content ?? '');
    const spans = [];
    let open = null;
    for (const match of text.matchAll(new RegExp(SPAN.source, 'gi'))) {
      const kind = match[1].toLowerCase();
      if (kind === 'protect' && open === null) open = match.index;
      if (kind === 'end' && open !== null) {
        spans.push(text.slice(open, match.index + match[0].length));
        open = null;
      }
    }
    if (open !== null) spans.push(text.slice(open));
    return spans;
  };
  const state = { seeded: null, records: new Map(), settingsBefore: null };
  globalThis.__soV2509 = {
    MARKER,
    spansOf,
    async createBook(name, entries) {
      if (!name.startsWith(MARKER)) throw new Error(`only ${MARKER} books are created here`);
      const module = await wi();
      if (!module.world_names.includes(name)) await module.createNewWorldInfo(name);
      const data = { entries: {} };
      entries.forEach((entry, uid) => {
        data.entries[uid] = {
          uid, key: entry.key ?? [], keysecondary: [], comment: entry.comment, content: entry.content, constant: false,
          selective: false, selectiveLogic: 0, addMemo: true, order: 100, position: 0, disable: Boolean(entry.disable), excludeRecursion: false,
          preventRecursion: false, delayUntilRecursion: false, probability: 100, useProbability: true, depth: 4, group: '', groupOverride: false,
          groupWeight: 100, scanDepth: null, caseSensitive: null, matchWholeWords: null, useGroupScoring: null, automationId: '', role: null,
          sticky: 0, cooldown: 0, delay: 0, displayIndex: uid,
        };
      });
      await module.saveWorldInfo(name, data, true);
      await module.updateWorldInfoList();
      return Object.keys(data.entries).length;
    },
    async readBook(name) {
      const data = await ctx().loadWorldInfo(name);
      return Object.values(data?.entries ?? {}).map((entry) => ({ comment: entry.comment, content: String(entry.content ?? ''), disabled: entry.disable === true }));
    },
    async deleteBook(name) {
      if (!name.startsWith(MARKER)) throw new Error(`only ${MARKER} books are deleted here`);
      const module = await wi();
      await module.updateWorldInfoList();
      if (!module.world_names.includes(name)) return false;
      return module.deleteWorldInfo(name);
    },
    async seed(name) {
      const rows = await this.readBook(name);
      state.seeded = rows.map((row) => ({ comment: row.comment, spans: spansOf(row.content), disabled: row.disabled })).filter((row) => row.spans.length);
      return state.seeded.length;
    },
    arm() {
      state.settingsBefore = { ...rt().getStagecraftState().settings };
      rt().setStagecraftSettings({ curatorEnabled: true, acceptMode: 'auto' });
      const settings = rt().getStagecraftState().settings;
      if (!settings.curatorEnabled || settings.acceptMode !== 'auto') throw new Error('the W3 arm did not land');
      return { curator: settings };
    },
    disarm() {
      if (state.settingsBefore) rt().setStagecraftSettings({ curatorEnabled: state.settingsBefore.curatorEnabled, acceptMode: state.settingsBefore.acceptMode });
      return { curator: rt().getStagecraftState().settings };
    },
    async acceptAll() {
      let decided = 0;
      for (const record of rt().getStagecraftState().proposals.filter((entry) => entry.curator === 'wi')) {
        if (!record.ops.some((entry) => entry.status === 'pending')) continue;
        await rt().decideCuratorProposal(record.id, 'accepted');
        decided += 1;
      }
      return decided;
    },
    collect() {
      for (const record of rt().getStagecraftState().proposals.filter((entry) => entry.curator === 'wi')) state.records.set(record.id, JSON.parse(JSON.stringify(record)));
      return state.records.size;
    },
    async tally(name) {
      this.collect();
      const records = [...state.records.values()];
      const planRefused = records.flatMap((record) => record.dropped.filter((reason) => REFUSED.test(reason)));
      const edgeRefused = records.flatMap((record) => record.ops.filter((entry) => entry.status === 'failed' && REFUSED.test(entry.message ?? '')));
      const ops = records.flatMap((record) => record.ops);
      const proposals = ops.length + planRefused.length;
      const applied = ops.filter((entry) => entry.status === 'applied');
      const opViolations = applied.filter((entry) => {
        const before = spansOf(entry.before?.content ?? '');
        if (!before.length) return false;
        if (entry.op.kind === 'disable') return true;
        return !before.every((span) => String(entry.after?.content ?? '').includes(span));
      }).map((entry) => `${entry.op.kind}:${entry.op.comment}`);
      const rows = await this.readBook(name);
      const bookViolations = (state.seeded ?? []).flatMap((seed) => {
        const row = rows.find((candidate) => candidate.comment === seed.comment);
        if (!row) return [`${seed.comment}: gone`];
        const lost = seed.spans.filter((span) => !row.content.includes(span)).map((span) => `${seed.comment}: lost ${span.slice(0, 60)}`);
        return row.disabled !== seed.disabled ? [...lost, `${seed.comment}: switched ${row.disabled ? 'off' : 'on'}`] : lost;
      });
      const refused = planRefused.length + edgeRefused.length;
      return {
        records: records.length, proposals, refused, planRefused: planRefused.length, edgeRefused: edgeRefused.length,
        refusedShare: proposals ? refused / proposals : null, applied: applied.length, violations: opViolations.length + bookViolations.length,
        opViolations, bookViolations, pending: ops.filter((entry) => entry.status === 'pending').length,
        byStatus: ops.reduce((counts, entry) => ({ ...counts, [entry.status]: (counts[entry.status] ?? 0) + 1 }), {}),
      };
    },
  };
})();
