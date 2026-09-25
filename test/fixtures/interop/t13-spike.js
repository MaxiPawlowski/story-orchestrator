// v2.4 plan 05 T13 spike measurement helpers (test-only; loaded by `inject_script`). Every book this
// touches carries the SO-T13 marker; `so-assets remove --marker SO-T13` deletes them. The expected
// effective set is recomputed here from the AUTHORED effects, independently of src/runtime, so a
// wrong scanGatePlan cannot agree with itself.
(() => {
  const ctx = () => globalThis.SillyTavern.getContext();
  const key = (world, comment) => `${String(world).trim().toLowerCase()}|${String(comment).trim()}`;
  const refs = (value) => (Array.isArray(value) ? value : value ? [value] : []).flatMap((ref) => {
    const lorebook = String(ref?.lorebook ?? ref?.book ?? '').trim();
    const comments = (Array.isArray(ref?.comments) ? ref.comments : ref?.comment ? [ref.comment] : []).map((comment) => String(comment).trim()).filter(Boolean);
    return lorebook && comments.length ? [{ lorebook, comments }] : [];
  });
  const gated = (story) => {
    const set = new Set();
    for (const checkpoint of story?.checkpoints ?? []) {
      const effect = checkpoint?.effects?.world_info ?? {};
      for (const ref of [...refs(effect.enable), ...refs(effect.disable)]) for (const comment of ref.comments) set.add(key(ref.lorebook, comment));
    }
    return set;
  };
  const counters = { edits: 0, vectorInsert: 0, vectorDelete: 0, armed: false };
  const wiModule = () => import('/scripts/world-info.js');
  globalThis.__soT13 = {
    counters,
    key,
    arm() {
      if (counters.armed) return { armed: true };
      const original = globalThis.fetch;
      globalThis.fetch = async (input, init) => {
        const url = String(typeof input === 'string' ? input : input?.url ?? '');
        if (url.includes('/api/worldinfo/edit')) counters.edits += 1;
        if (url.includes('/api/vector/insert')) counters.vectorInsert += 1;
        if (url.includes('/api/vector/delete')) counters.vectorDelete += 1;
        return original(input, init);
      };
      counters.armed = true;
      globalThis.__soT13.disarm = () => { globalThis.fetch = original; counters.armed = false; return { disarmed: true }; };
      return { armed: true };
    },
    reset() { counters.edits = 0; counters.vectorInsert = 0; counters.vectorDelete = 0; return { ...counters }; },
    async serverBook(name) {
      const response = await fetch('/api/worldinfo/get', { method: 'POST', headers: ctx().getRequestHeaders(), body: JSON.stringify({ name }), cache: 'no-cache' });
      return response.ok ? response.json() : null;
    },
    async writeBook(name, data) {
      await ctx().saveWorldInfo(name, data, true);
      (await wiModule()).worldInfoCache.delete(name);
      return { written: Object.keys(data?.entries ?? {}).length };
    },
    async copyExampleBook(name) {
      const response = await fetch('/scripts/extensions/third-party/story-orchestrator/examples/sun-ruins/Xentar%20Checkpoints.json', { cache: 'no-cache' });
      if (!response.ok) throw new Error(`the sun-ruins example book did not load: ${response.status}`);
      const data = await response.json();
      return this.writeBook(name, { entries: data.entries });
    },
    async setDisabled(name, comments, disable) {
      const data = await this.serverBook(name);
      if (!data?.entries) throw new Error(`no server copy of ${name}`);
      const wanted = new Set(comments);
      for (const entry of Object.values(data.entries)) if (wanted.has(String(entry.comment ?? '').trim())) entry.disable = disable;
      return this.writeBook(name, data);
    },
    async effective(books) {
      const wanted = new Set(books.map((book) => book.trim().toLowerCase()));
      const entries = await (await wiModule()).getSortedEntries();
      const on = new Map();
      for (const entry of entries) if (wanted.has(String(entry.world).trim().toLowerCase())) {
        const id = key(entry.world, entry.comment ?? '');
        if (!on.has(id)) on.set(id, entry.disable !== true);
      }
      return on;
    },
    expected(library, loaded, path) {
      const all = new Set(library.flatMap((story) => [...gated(story)]));
      const on = new Set();
      if (loaded) {
        for (const id of path) {
          const effect = loaded.checkpoints.find((checkpoint) => checkpoint.id === id)?.effects?.world_info ?? {};
          for (const ref of refs(effect.enable)) for (const comment of ref.comments) on.add(key(ref.lorebook, comment));
          for (const ref of refs(effect.disable)) for (const comment of ref.comments) on.delete(key(ref.lorebook, comment));
        }
      }
      return new Map([...all].map((id) => [id, on.has(id)]));
    },
    async check(label, library, loaded, path, books) {
      const expected = this.expected(library, loaded, path);
      const actual = await this.effective(books);
      const wrong = [...expected].filter(([id, on]) => actual.has(id) && actual.get(id) !== on).map(([id, on]) => `${id}: expected ${on ? 'on' : 'off'}`);
      const unseen = [...expected.keys()].filter((id) => !actual.has(id));
      return { label, gated: expected.size, matched: expected.size - wrong.length - unseen.length, wrong, unseen };
    },
    async goto(target, storyId, timeoutMs = 30000) {
      const script = await import('/script.js');
      if (target.groupId) {
        const groups = await import('/scripts/group-chats.js');
        await groups.openGroupChat(target.groupId, target.chatId);
      } else {
        const chid = ctx().characters.findIndex((card) => card?.avatar === target.avatar);
        if (chid < 0) throw new Error(`no character with avatar ${target.avatar}`);
        if (String(ctx().characterId) !== String(chid) || ctx().groupId) await script.selectCharacterById(chid);
        if (ctx().chatId !== target.chatId) await script.openCharacterChat(target.chatId);
      }
      const started = Date.now();
      for (;;) {
        const snapshot = globalThis.storyOrchestratorRuntime.getSnapshot();
        if (ctx().chatId === target.chatId && (storyId === null ? !snapshot.storyId : snapshot.storyId === storyId && snapshot.ready)) return { chatId: ctx().chatId, storyId: snapshot.storyId };
        if (Date.now() - started > timeoutMs) throw new Error(`goto ${target.chatId}: still on ${ctx().chatId} with story ${snapshot.storyId}`);
        await new Promise((resolve) => setTimeout(resolve, 250));
      }
    },
    here() {
      const c = ctx();
      return c.groupId ? { groupId: c.groupId, chatId: c.chatId } : { avatar: c.characters[c.characterId]?.avatar, chatId: c.chatId };
    },
  };
  return { installed: true };
})();
