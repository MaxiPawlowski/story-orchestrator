// v2.5 plan 01 live gates G1/G2/G5/G8 helpers (test-only; loaded by `inject_script` AFTER t13-spike.js, whose
// serverBook/writeBook/setDisabled/effective/check it reuses). LANES ONLY: it normalises the lane's REAL
// library books through the product's own confirm, and puts every one of them back byte for byte from the
// copy it saved first (sessionStorage `so-v25-01-books`, which survives the G5 reload). The expected gated
// set is recomputed here from the AUTHORED effects, independently of src/runtime.
(() => {
  const ctx = () => globalThis.SillyTavern.getContext();
  const rt = () => globalThis.storyOrchestratorRuntime;
  const S = () => {
    if (!globalThis.__soT13) throw new Error('inject t13-spike.js before v25-01-gating.js');
    return globalThis.__soT13;
  };
  const BOOKS_KEY = 'so-v25-01-books';
  const RECORD_KEY = 'so-v25-01';
  const CONFIRM_TEXT = 'Switch lorebook gating to per chat';
  const refs = (value) => (Array.isArray(value) ? value : value ? [value] : []).flatMap((ref) => {
    const lorebook = String(ref?.lorebook ?? '').trim();
    const comments = (Array.isArray(ref?.comments) ? ref.comments : []).map((comment) => String(comment).trim()).filter(Boolean);
    return lorebook && comments.length ? [{ lorebook, comments }] : [];
  });
  const gatedByBook = (library) => {
    const books = new Map();
    for (const story of library) for (const checkpoint of story?.checkpoints ?? []) {
      const effect = checkpoint?.effects?.world_info ?? {};
      for (const ref of [...refs(effect.enable), ...refs(effect.disable)]) {
        const listed = (ctx().getWorldInfoNames?.() ?? []).find((name) => name.toLowerCase() === ref.lorebook.toLowerCase());
        if (!listed) continue;
        const set = books.get(listed) ?? new Set();
        ref.comments.forEach((comment) => set.add(comment));
        books.set(listed, set);
      }
    }
    return books;
  };
  const firstUid = (book, comment) => Object.values(book?.entries ?? {}).find((entry) => String(entry.comment ?? '').trim() === comment)?.uid;
  globalThis.__soV25 = {
    record() { return JSON.parse(localStorage.getItem(RECORD_KEY) ?? '{}'); },
    save(record) { localStorage.setItem(RECORD_KEY, JSON.stringify(record)); return record; },
    library() { return rt().getSnapshot().library.map((record) => record.raw); },
    gated(library = this.library()) { return gatedByBook(library); },
    async saveBooks(names) {
      if (sessionStorage.getItem(BOOKS_KEY)) throw new Error('a previous run left its saved books in sessionStorage; restore them (restoreBooks) before starting again');
      const books = {};
      for (const name of names) books[name] = await S().serverBook(name);
      sessionStorage.setItem(BOOKS_KEY, JSON.stringify(books));
      return Object.keys(books).length;
    },
    async restoreBooks() {
      const books = JSON.parse(sessionStorage.getItem(BOOKS_KEY) ?? 'null');
      if (!books) return { restored: 0 };
      for (const [name, data] of Object.entries(books)) if (data?.entries) await S().writeBook(name, data);
      const back = {};
      for (const name of Object.keys(books)) back[name] = JSON.stringify((await S().serverBook(name))?.entries ?? null) === JSON.stringify(books[name]?.entries ?? null);
      sessionStorage.removeItem(BOOKS_KEY);
      return { restored: Object.keys(books).length, identical: back };
    },
    async confirmScan(timeout = 120000) {
      const gating = globalThis.storyOrchestratorScanGating;
      if (!gating) throw new Error('storyOrchestratorScanGating is not installed');
      const request = gating.requestScan();
      const started = Date.now();
      for (;;) {
        const dialog = [...document.querySelectorAll('dialog[open]')].find((node) => (node.querySelector('.popup-content')?.textContent ?? '').includes(CONFIRM_TEXT));
        const ok = dialog?.querySelector('.popup-button-ok');
        if (ok) { ok.click(); break; }
        if (Date.now() - started > timeout) throw new Error('the lorebook gating confirm never appeared');
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      const activated = await request;
      if (!activated) throw new Error(`per-chat gating did not activate: ${JSON.stringify(gating.capability())}`);
      return { active: gating.active(), capability: gating.capability() };
    },
    // G2: what the confirmed normalisation changed, per book, against a copy read before it. A gated entry is the
    // FIRST entry carrying its comment (the one the file path flips, 05-H4); every other entry must be identical.
    diff(before, after, gated) {
      const out = { gatedOff: 0, gatedNotOff: [], gatedOtherKeysChanged: [], nonGatedChanged: [], entriesAdded: [], entriesRemoved: [] };
      for (const [name, comments] of gated) {
        const was = before[name]?.entries ?? {};
        const now = after[name]?.entries ?? {};
        const gatedUids = new Set([...comments].map((comment) => firstUid(before[name], comment)).filter((uid) => uid !== undefined).map(String));
        for (const uid of Object.keys(now)) if (!(uid in was)) out.entriesAdded.push(`${name}#${uid}`);
        for (const uid of Object.keys(was)) {
          if (!(uid in now)) { out.entriesRemoved.push(`${name}#${uid}`); continue; }
          if (!gatedUids.has(uid)) {
            if (JSON.stringify(was[uid]) !== JSON.stringify(now[uid])) out.nonGatedChanged.push(`${name}: ${was[uid].comment}`);
            continue;
          }
          if (now[uid].disable === true) out.gatedOff += 1;
          else out.gatedNotOff.push(`${name}: ${was[uid].comment}`);
          const { disable: _a, ...wasRest } = was[uid];
          const { disable: _b, ...nowRest } = now[uid];
          if (JSON.stringify(wasRest) !== JSON.stringify(nowRest)) out.gatedOtherKeysChanged.push(`${name}: ${was[uid].comment}`);
        }
      }
      return out;
    },
    async serverBooks(names) {
      const books = {};
      for (const name of names) books[name] = await S().serverBook(name);
      return books;
    },
    // Every present gated entry switched ON on disk first (the S1 adversarial start), so a leak cannot pass for rest-off.
    async allOn(gated) {
      let count = 0;
      for (const [name, comments] of gated) {
        const book = await S().serverBook(name);
        const present = [...comments].filter((comment) => firstUid(book, comment) !== undefined);
        if (present.length) await S().setDisabled(name, present, false);
        count += present.length;
      }
      return count;
    },
    presentGated(books, gated) {
      const keys = [];
      for (const [name, comments] of gated) for (const comment of comments) if (firstUid(books[name], comment) !== undefined) keys.push(`${name}|${comment}`);
      return keys;
    },
    ledgerKeys() {
      const ledger = rt().getGlobalSettings().worldInfo.normalized ?? {};
      return Object.entries(ledger).flatMap(([name, comments]) => comments.map((comment) => `${name}|${comment}`));
    },
    async waitFor(predicate, label, timeout = 60000) {
      const started = Date.now();
      for (;;) {
        const value = await predicate();
        if (value) return value;
        if (Date.now() - started > timeout) throw new Error(`timed out waiting for ${label}`);
        await new Promise((resolve) => setTimeout(resolve, 250));
      }
    },
  };
  return { installed: true };
})();
