const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const x = (c) => SillyTavern.getContext().executeSlashCommandsWithOptions(c);
await x('/go Ponticius');
for (let i = 0; i < 60 && SillyTavern.getContext().characterId === undefined; i++) await sleep(100);
await sleep(1500);
await x('/newchat');
await sleep(3000);
for (const t of ['POP-0 I stand at the gate.', 'POP-1 I look around the guildhall.', 'POP-2 I wait for the caravan.']) { await x('/send compact=true ' + t); await sleep(600); }
await sleep(3000);
const c = SillyTavern.getContext();
return { chatId: c.chatId, characterId: c.characterId, groupId: c.groupId ?? null, len: c.chat.length, names: c.chat.map((m) => m.name), mes: c.chat.map((m) => m.mes.slice(0, 40)) };
