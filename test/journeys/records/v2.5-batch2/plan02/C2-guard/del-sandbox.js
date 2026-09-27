const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const groups = await import('/scripts/group-chats.js');
const G = '1759606632088';
const ids = JSON.parse(localStorage.getItem('so-del-chats') || '[]');
const out = [];
for (const id of ids) {
  await groups.deleteGroupChat(G, id, { jumpToNewChat: false });
  await sleep(1500);
  const d = document.querySelector('dialog[open]');
  out.push({ id, dialog: d ? (d.querySelector('.popup-content')?.innerText ?? '').slice(0, 200) : null });
  if (d) d.querySelector('.popup-button-cancel')?.click();
}
await sleep(3000);
const g = SillyTavern.getContext().groups.find((x) => x.id === G);
return { out, remaining: g.chats.filter((c) => ids.includes(c)), chatId: SillyTavern.getContext().chatId };
