const ledger = JSON.parse(localStorage.getItem('so-v25-g1c-ledger') ?? '[]');
const c = SillyTavern.getContext();
const wi = await import('/scripts/world-info.js');
const all = await wi.getSortedEntries();
const enabled = all.filter((x) => x.disable !== true).map((x) => x.world + ': ' + String(x.comment ?? '').trim());
const lower = new Set(ledger.map((k) => k.toLowerCase()));
const inSorted = all.filter((x) => lower.has((x.world + ': ' + String(x.comment ?? '').trim()).toLowerCase())).length;
const leaked = enabled.filter((k) => lower.has(k.toLowerCase()));
return { chat: c.chatId ?? null, character: c.characters[c.characterId]?.name ?? null, groupId: c.groupId ?? null, soLoaded: typeof globalThis.storyOrchestratorRuntime !== 'undefined', ledgerSize: ledger.length, ledgerEntriesInSortedEntries: inSorted, sortedTotal: all.length, enabledTotal: enabled.length, leaked, chatStoryMeta: Boolean(c.chatMetadata?.story_orchestrator?.selectedStoryId) };
