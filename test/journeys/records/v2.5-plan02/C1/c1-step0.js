const SOLO = 'Ponticius - 2025-10-27 @11h 06m 58s 578ms';
const sleep = (ms) => new Promise((res) => setTimeout(res, ms));
const script = await import('/script.js');
const c0 = SillyTavern.getContext();
const B = c0.chatId, G = c0.groupId;
if (!G || !B) throw new Error('needs a group chat');
if (rt.getSnapshot().storyId !== 'so-v25-c2c1') throw new Error('story not selected');
const es = c0.eventSource, et = c0.eventTypes;
const events = [];
let streamTokens = 0;
const offs = ['GENERATION_STARTED', 'GENERATION_STOPPED', 'GENERATION_ENDED', 'MESSAGE_RECEIVED', 'CHARACTER_MESSAGE_RENDERED', 'CHAT_CHANGED', 'GROUP_WRAPPER_FINISHED', 'STREAM_TOKEN_RECEIVED'].filter((n) => et[n]).map((name) => {
  let tokens = 0;
  const f = (...a) => { if (name === 'STREAM_TOKEN_RECEIVED') { tokens += 1; streamTokens = tokens; if (tokens % 20 !== 1) return; } const c = SillyTavern.getContext(); events.push({ ev: name, t: Date.now(), chatId: c.chatId ?? null, groupId: c.groupId ?? null, gen: Boolean(document.body.dataset.generating), arg: typeof a[0] === 'number' || typeof a[0] === 'string' ? String(a[0]).slice(0, 60) : null, chatLen: c.chat.length }); };
  es.on(et[name], f);
  return () => es.removeListener(et[name], f);
});
const idle = async (ms) => { const until = Date.now() + ms; let quiet = 0; while (Date.now() < until) { quiet = document.body.dataset.generating ? 0 : quiet || Date.now(); if (quiet && Date.now() - quiet >= 2000) return true; await sleep(100); } return false; };
const schedulerIdle = async (ms) => { const until = Date.now() + ms; let quiet = 0; while (Date.now() < until) { const s = rt.getSnapshot().extraction.scheduler; const busy = s.inFlight || s.queueDepth > 0 || s.heavyInFlight || (s.heavyQueueDepth ?? 0) > 0; quiet = busy ? 0 : quiet || Date.now(); if (quiet && Date.now() - quiet >= 1500) return true; await sleep(100); } return false; };
const settle = async () => { const until = Date.now() + 30000; while (Date.now() < until && script.isChatSaving) await sleep(100); await sleep(2000); return !script.isChatSaving; };
const dialog = () => { const d = document.querySelector('dialog[open]'); return d ? (d.querySelector('.popup-content')?.innerText ?? '').slice(0, 300) : null; };
const post = async (url, body) => { const r = await fetch(url, { method: 'POST', headers: SillyTavern.getContext().getRequestHeaders(), body: JSON.stringify(body) }); const d = await r.json().catch(() => null); const rows = Array.isArray(d) ? d : []; const header = rows[0] && Object.hasOwn(rows[0], 'chat_metadata') ? rows[0] : null; const msgs = header ? rows.slice(1) : rows; return { http: r.status, integrity: header?.chat_metadata?.integrity ?? null, messages: msgs.length, names: msgs.map((m) => m.name).slice(-4), last: (msgs.at(-1)?.mes ?? '').slice(0, 120), blob: header?.chat_metadata?.story_orchestrator?.stories?.['so-v25-c2c1'] ? { lsim: header.chat_metadata.story_orchestrator.stories['so-v25-c2c1'].extras?.lastSelfInjectionMessageId ?? null, fired: header.chat_metadata.story_orchestrator.stories['so-v25-c2c1'].extras?.firedNpcReplies ?? null, active: header.chat_metadata.story_orchestrator.stories['so-v25-c2c1'].engineState?.activeCheckpointId ?? null } : null }; };
const diskGroup = () => post('/api/chats/group/get', { id: B });
const soloChar = SillyTavern.getContext().characters.find((c) => c.name === 'Ponticius');
const diskSolo = () => post('/api/chats/get', { ch_name: soloChar.name, file_name: SOLO, avatar_url: soloChar.avatar });
try {
  if (!(await idle(180000))) throw new Error('never idle');
  if (!(await schedulerIdle(300000))) throw new Error('scheduler never idle');
  await settle();
  const exB = rt.extras;
  const before = { B, lsim: exB.lastSelfInjectionMessageId, fired: { ...exB.firedNpcReplies }, bPage: SillyTavern.getContext().chat.length, bDisk: await diskGroup(), soloDisk: await diskSolo(), streamingSetting: SillyTavern.getContext().textCompletionSettings?.streaming ?? null, mainApi: SillyTavern.getContext().mainApi };
  const outcome = {};
  const pending = rt.activateCheckpoint('speak').then((v) => { outcome.value = v; outcome.at = Date.now(); }, (e) => { outcome.error = String(e?.message ?? e); outcome.at = Date.now(); });
  const startUntil = Date.now() + 60000;
  while (Date.now() < startUntil && !document.body.dataset.generating) await sleep(25);
  if (!document.body.dataset.generating) throw new Error('the /trigger generation never started ' + JSON.stringify(outcome));
  const genStartedAt = Date.now();
  let streamed = 0;
  const streamUntil = Date.now() + 90000;
  while (Date.now() < streamUntil && document.body.dataset.generating && !outcome.at) { if (streamTokens >= 8) { const last = document.querySelector('#chat .mes.last_mes .mes_text'); streamed = last ? last.innerText.length : 0; break; } await sleep(25); }
  const lastMesBefore = document.querySelector('#chat .mes.last_mes');
  const atSwitch = { stillGenerating: Boolean(document.body.dataset.generating), outcomeSettled: Boolean(outcome.at), streamedChars: streamed, streamTokens, streamingMesName: lastMesBefore?.getAttribute('ch_name') ?? null, pageChatLen: SillyTavern.getContext().chat.length, msGenToSwitch: Date.now() - genStartedAt, saving: script.isChatSaving };
  if (!atSwitch.stillGenerating || atSwitch.outcomeSettled) return { discriminates: false, reason: 'the reply finished before the switch', before, atSwitch, outcome, events };
  const switchAt = Date.now();
  let go = null; let goThrew = null; try { go = await SillyTavern.getContext().executeSlashCommandsWithOptions('/go Ponticius'); } catch (e) { goThrew = { at: Date.now() - switchAt, message: String(e?.message ?? e).slice(0, 200), cause: String(e?.cause?.stack ?? e?.stack ?? '').split(String.fromCharCode(10)).slice(0, 12).map((l) => l.trim().slice(0, 140)) }; }
  const openUntil = Date.now() + 30000;
  while (Date.now() < openUntil && SillyTavern.getContext().chatId !== SOLO) await sleep(50);
  const afterSwitch = { t: Date.now() - switchAt, goError: go?.isError ?? null, goThrew, chid: SillyTavern.getContext().characterId ?? null, openChat: SillyTavern.getContext().chatId, generating: Boolean(document.body.dataset.generating), pageChatLen: SillyTavern.getContext().chat.length };
  const doneUntil = Date.now() + 300000;
  while (Date.now() < doneUntil && !outcome.at) await sleep(100);
  const triggerResolved = { settled: Boolean(outcome.at), msAfterSwitch: outcome.at ? outcome.at - switchAt : null, value: outcome.value ?? null, error: outcome.error ?? null };
  await idle(120000);
  await sleep(10000);
  await settle();
  const c = SillyTavern.getContext();
  const after = { openChat: c.chatId ?? null, characterId: c.characterId ?? null, groupId: c.groupId ?? null, soloPageLen: c.chat.length, soloPageNames: c.chat.map((m) => m.name).slice(-4), soloPageLast: (c.chat.at(-1)?.mes ?? '').slice(0, 120), exBlsim: exB.lastSelfInjectionMessageId, exBfired: exB.firedNpcReplies, bDisk: await diskGroup(), soloDisk: await diskSolo(), dialog: dialog() };
  return { discriminates: true, before, atSwitch, afterSwitch, triggerResolved, after, events };
} finally {
  offs.forEach((off) => off());
}
