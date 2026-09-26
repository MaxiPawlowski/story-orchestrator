(() => {
  const ctx = () => globalThis.SillyTavern.getContext();
  const KEY = 'so-v25-sp5';
  const MEMBERS = ['Arin', 'Luke', 'Ponticius', 'DM Narrator'];
  const cardText = (name) => `SO-SP5 card scenario of ${name}.`;
  const load = () => JSON.parse(localStorage.getItem(KEY) ?? '{}');
  const save = (T) => { localStorage.setItem(KEY, JSON.stringify(T)); return T; };
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const settle = async () => {
    const script = await import('/script.js');
    for (let index = 0; index < 150 && script.isChatSaving; index += 1) await sleep(100);
    await sleep(2000);
  };
  const authored = (checkpoint) => (checkpoint?.effects && Object.prototype.hasOwnProperty.call(checkpoint.effects, 'scenario')
    ? String(checkpoint.effects.scenario ?? '').trim()
    : null);
  const count = (text, needle) => {
    let hits = 0;
    let at = 0;
    while (needle && (at = text.indexOf(needle, at)) >= 0) { hits += 1; at += needle.length; }
    return hits;
  };
  const S = {
    KEY,
    load,
    save,
    settle,
    count,
    cardText,
    expected(story, path) {
      let text = null;
      for (const id of path) {
        const own = authored(story.checkpoints.find((checkpoint) => checkpoint.id === id));
        if (own !== null) text = own;
      }
      return text;
    },
    scenarios(story) {
      return story.checkpoints.map(authored).filter((text) => text);
    },
    async flag(on) {
      const settings = ctx().extensionSettings;
      const root = ((settings['story-orchestrator'] ??= {}).settings ??= {});
      const T = load();
      if (!Object.prototype.hasOwnProperty.call(T, 'flagBefore')) save({ ...T, flagBefore: root.spikes?.sp5Scenario ?? null });
      const before = load().flagBefore;
      const spikes = { ...(root.spikes ?? {}) };
      if (on) spikes.sp5Scenario = true;
      else if (before === null) delete spikes.sp5Scenario;
      else spikes.sp5Scenario = before;
      if (Object.keys(spikes).length) root.spikes = spikes;
      else delete root.spikes;
      ctx().saveSettingsDebounced();
      await sleep(2500);
      return { spikes: root.spikes ?? null };
    },
    plant() {
      const T = load();
      const planted = T.planted ?? {};
      for (const name of MEMBERS) {
        const card = ctx().characters.find((character) => character?.name === name);
        if (!card) continue;
        if (!Object.prototype.hasOwnProperty.call(planted, name)) planted[name] = card.scenario ?? '';
        card.scenario = cardText(name);
      }
      save({ ...T, planted });
      return Object.keys(planted);
    },
    unplant() {
      const T = load();
      for (const [name, value] of Object.entries(T.planted ?? {})) {
        const card = ctx().characters.find((character) => character?.name === name);
        if (card) card.scenario = value;
      }
      save({ ...T, planted: {} });
      return { restored: Object.keys(T.planted ?? {}) };
    },
    async capture() {
      const c = ctx();
      let text = null;
      const textCompletion = (data) => { if (data?.dryRun && typeof data.prompt === 'string') text = data.prompt; };
      const chatCompletion = (data) => {
        if (data?.dryRun && Array.isArray(data.chat)) text = data.chat.map((message) => (typeof message?.content === 'string' ? message.content : JSON.stringify(message?.content ?? ''))).join('\n');
      };
      c.eventSource.on(c.eventTypes.GENERATE_AFTER_COMBINE_PROMPTS, textCompletion);
      c.eventSource.on(c.eventTypes.CHAT_COMPLETION_PROMPT_READY, chatCompletion);
      try {
        await c.generate('normal', {}, true);
      } finally {
        c.eventSource.removeListener(c.eventTypes.GENERATE_AFTER_COMBINE_PROMPTS, textCompletion);
        c.eventSource.removeListener(c.eventTypes.CHAT_COMPLETION_PROMPT_READY, chatCompletion);
      }
      if (typeof text !== 'string') throw new Error('the dry-run request was not captured');
      return text;
    },
    async check(label, story, storyId) {
      const rt = globalThis.storyOrchestratorRuntime;
      const prompt = await S.capture();
      const texts = S.scenarios(story);
      const want = storyId ? S.expected(story, rt.getEngineState().visitedPath ?? []) : null;
      const held = String(ctx().chatMetadata?.scenario ?? '');
      const hits = Object.fromEntries(texts.map((text) => [text, count(prompt, text)]));
      const fail = [];
      if (want) {
        if (hits[want] !== 1) fail.push(`${label}: the path's scenario is in the request ${hits[want]} time(s), not once`);
        for (const text of texts) if (text !== want && hits[text]) fail.push(`${label}: another checkpoint's scenario is in the request`);
        if (held !== want) fail.push(`${label}: chat_metadata.scenario holds ${JSON.stringify(held)}`);
      } else {
        for (const text of texts) if (hits[text]) fail.push(`${label}: a story scenario reached a chat that plays no story`);
        if (texts.includes(held)) fail.push(`${label}: chat_metadata.scenario holds a story scenario`);
      }
      return { label, chatId: ctx().chatId, storyId: storyId ?? null, want, held, hits, fail };
    },
    async goto(target, storyId, timeoutMs = 30000) {
      await settle();
      const script = await import('/script.js');
      if (target.groupId) {
        const groups = await import('/scripts/group-chats.js');
        if (String(ctx().groupId ?? '') !== String(target.groupId)) await groups.openGroupById(target.groupId);
        if (ctx().chatId !== target.chatId) await groups.openGroupChat(target.groupId, target.chatId);
      } else {
        const chid = ctx().characters.findIndex((card) => card?.avatar === target.avatar);
        if (chid < 0) throw new Error(`no character with avatar ${target.avatar}`);
        if (String(ctx().characterId) !== String(chid) || ctx().groupId) await script.selectCharacterById(chid);
        if (ctx().chatId !== target.chatId) await script.openCharacterChat(target.chatId);
      }
      const started = Date.now();
      for (;;) {
        const snapshot = globalThis.storyOrchestratorRuntime.getSnapshot();
        if (ctx().chatId === target.chatId && (storyId === null ? !snapshot.storyId : snapshot.storyId === storyId && snapshot.ready)) {
          await settle();
          return { chatId: ctx().chatId, storyId: snapshot.storyId };
        }
        if (Date.now() - started > timeoutMs) throw new Error(`goto ${target.chatId}: still on ${ctx().chatId} with story ${snapshot.storyId}`);
        await sleep(250);
      }
    },
    here() {
      const c = ctx();
      return c.groupId ? { groupId: c.groupId, chatId: c.chatId } : { avatar: c.characters[c.characterId]?.avatar, chatId: c.chatId };
    },
    rows() {
      return globalThis.storyOrchestratorRuntime.getSnapshot().effects.ledger.filter((row) => row.target?.kind === 'extension' && row.target?.name === 'scenario');
    },
  };
  globalThis.__soSp5 = S;
  return { installed: true };
})();
