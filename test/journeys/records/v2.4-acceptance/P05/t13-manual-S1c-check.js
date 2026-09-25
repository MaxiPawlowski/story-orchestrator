const ctx = SillyTavern.getContext();
const wi = await import('/scripts/world-info.js');
const normalized = ["CP1 - Mission","CP1 - Scenario","CP2 - Mission","CP2 - Scenario","CP3 - Luke","CP4 - Scenario","CP4 - Sphinx","CP4 - Sphinx's Riddle","General - Magic"];
if (globalThis.storyOrchestratorRuntime) throw new Error('extension still loaded');
if (!ctx.groupId) throw new Error('no group open');
const disk = await fetch('/api/worldinfo/get', { method: 'POST', headers: ctx.getRequestHeaders(), body: JSON.stringify({ name: 'SO-T13 Xentar' }) }).then((r) => r.json());
const onDiskEnabled = Object.values(disk.entries).filter((e) => normalized.includes(e.comment) && e.disable !== true).map((e) => e.comment);
const sorted = await wi.getSortedEntries();
const viewEnabled = sorted.filter((x) => x.world === 'SO-T13 Xentar' && x.disable !== true && normalized.includes(x.comment)).map((x) => x.comment);
const fired = [];
let scans = 0;
const onAct = (entries) => { scans++; for (const e of entries ?? []) fired.push(`${e.world} :: ${e.comment}`); };
ctx.eventSource.on(ctx.eventTypes.WORLD_INFO_ACTIVATED, onAct);
const names = ['DM Narrator', 'Arin', 'Ponticius'];
const lines = ['We walk into Xentar and ask about the sphinx riddle and the sun ruins.', 'Tell me about the magic of the continent and the guild.', 'What does Luke know about the moon ruins archives?'];
try {
  for (let i = 0; i < 3; i++) {
    await ctx.executeSlashCommandsWithOptions(`/send compact=true ${lines[i]}`, { handleParserErrors: false });
    await ctx.executeSlashCommandsWithOptions(`/trigger await=true ${names[i]}`, { handleParserErrors: false });
  }
} finally { ctx.eventSource.removeListener(ctx.eventTypes.WORLD_INFO_ACTIVATED, onAct); }
const leaked = fired.filter((f) => f.startsWith('SO-T13 Xentar :: ') && normalized.includes(f.split(' :: ')[1]));
return { chat: ctx.chatId, onDiskEnabled, viewEnabled, ring: { scans, leaked, xentarFired: fired.filter((f) => f.startsWith('SO-T13 Xentar')) }, chatLength: ctx.chat.length, lastSpeakers: ctx.chat.slice(-6).map((m) => m.name) };
