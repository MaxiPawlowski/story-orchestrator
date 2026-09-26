const G = '1759606632088';
if (ctx.groupId !== G) throw new Error('not in group ' + G + ': ' + ctx.groupId);
const r = await ctx.executeSlashCommandsWithOptions('/newchat');
const sleep = (ms) => new Promise((res) => setTimeout(res, ms));
await sleep(3000);
const c2 = SillyTavern.getContext();
const story = {
  format: 2, id: 'so-v25-c2c1', version: 1, title: 'SO-V25-C2C1 save race and NPC switch',
  description: 'v2.5 plan 02 C2/C1 step 0 lane vehicle.',
  qualities: [{ key: 'harness_gate', type: 'bool', source: 'code', latching: true, rubric: 'Set only by the test harness.' }],
  checkpoints: [
    { id: 'start', name: 'Start', objective: 'Wait.', type: 'anchor', start: true },
    { id: 'speak', name: 'Speak', objective: 'The narrator speaks once.', type: 'anchor', effects: { npc_replies: [{ trigger: 'onEnter', member: 'DM Narrator', kind: 'llm', maxTriggers: 1 }] } }
  ],
  transitions: [{ from: 'start', to: 'speak', priority: 1, gate: { q: 'harness_gate', op: '==', v: true } }],
  roster: [{ id: 'DM Narrator', name: 'DM Narrator' }]
};
const imported = await rt.importStory(JSON.stringify(story));
await sleep(3000);
return { newchat: r?.isError ?? null, groupId: c2.groupId, chatId: SillyTavern.getContext().chatId, chatLen: SillyTavern.getContext().chat.length, imported: imported && (imported.ok ?? true), storyId: rt.getSnapshot().storyId };
