const G = '1759606632088', S = '2026-09-26@02h04m03s354ms', SOLO = 'Ponticius - 2025-10-27 @11h 06m 58s 578ms';
const sleep = (ms) => new Promise((res) => setTimeout(res, ms));
const script = await import('/script.js');
const groups = await import('/scripts/group-chats.js');
const dialog = () => { const d = document.querySelector('dialog[open]'); return d ? (d.querySelector('.popup-content')?.innerText ?? d.innerText ?? '').slice(0, 300) : null; };
const settle = async (ms = 30000) => { const until = Date.now() + ms; while (Date.now() < until && script.isChatSaving) await sleep(100); await sleep(1500); return !script.isChatSaving; };
const trace = [];
const mark = (what) => trace.push({ what, t: Date.now(), chatId: SillyTavern.getContext().chatId ?? null, groupId: SillyTavern.getContext().groupId ?? null, saving: script.isChatSaving, dialog: dialog() });
if (dialog()) return { aborted: 'dialog open before the attempt', dialog: dialog() };
if (SillyTavern.getContext().chatId !== S) { await groups.openGroupById(G); await sleep(2000); }
if (SillyTavern.getContext().chatId !== S) throw new Error('not in sandbox chat: ' + SillyTavern.getContext().chatId);
if (rt.getSnapshot().storyId !== 'so-v25-c2c1') throw new Error('story not selected: ' + rt.getSnapshot().storyId);
await settle();
mark('pre');
rt.setUiSettings({});
const tap = [];
const under = globalThis.fetch;
globalThis.fetch = function (input, init) {
  const url = typeof input === 'string' ? input : String(input?.url ?? '');
  if (url.includes('/api/chats/save') || url.includes('/api/chats/group/save')) {
    let body = null; try { body = typeof init?.body === 'string' ? JSON.parse(init.body) : null; } catch {}
    const header = Array.isArray(body?.chat) ? body.chat[0] : null;
    const hasHeader = Boolean(header) && typeof header === 'object' && 'chat_metadata' in header;
    tap.push({ t: Date.now(), url, file: body?.id ?? body?.file_name ?? null, integrity: header?.chat_metadata?.integrity ?? null, rows: Array.isArray(body?.chat) ? body.chat.length - (hasHeader ? 1 : 0) : null, open: { chatId: SillyTavern.getContext().chatId ?? null, groupId: SillyTavern.getContext().groupId ?? null }, stack: String(new Error('tap').stack ?? '').split(String.fromCharCode(10)).slice(2, 9).map((l) => l.trim().slice(0, 120)).join(' | ') });
  }
  return under.call(this, input, init);
};
mark('persist-asked');
const go = await SillyTavern.getContext().executeSlashCommandsWithOptions('/go Ponticius');
mark('go-returned');
const until = Date.now() + 30000;
while (Date.now() < until && SillyTavern.getContext().chatId !== SOLO) await sleep(50);
mark('solo-open');
for (let i = 0; i < 20 && !dialog(); i += 1) await sleep(250);
const soloSettled = await settle();
mark('solo-settled');
if (dialog()) return { tap, wedgeCandidate: true, go: go?.isError ?? null, soloSettled, trace };
await groups.openGroupById(G);
const back = Date.now() + 30000;
while (Date.now() < back && SillyTavern.getContext().chatId !== S) await sleep(50);
mark('group-open');
for (let i = 0; i < 12 && !dialog(); i += 1) await sleep(250);
const groupSettled = await settle();
mark('group-settled');
return { tap, go: go?.isError ?? null, soloSettled, groupSettled, backInSandbox: SillyTavern.getContext().chatId === S, dialog: dialog(), trace };
