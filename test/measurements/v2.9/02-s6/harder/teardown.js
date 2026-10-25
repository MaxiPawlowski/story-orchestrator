const names = ["Brelan", "Nerik", "Veska"];
const group = "Group: S6H Clerks";
const creator = "story-orchestrator v29-02-s6h";
const removed = { groups: [], cards: [] };
for (const g of ctx.groups.filter((x) => x.name === group)) {
  const response = await fetch("/api/groups/delete", { method: "POST", headers: ctx.getRequestHeaders(), body: JSON.stringify({ id: g.id }) });
  if (!response.ok) throw new Error("group delete failed: " + response.status);
  removed.groups.push(g.id);
}
for (const c of ctx.characters.filter((x) => names.includes(x.name) && ((x.data?.creator ?? x.creator ?? "") === creator || (x.tags ?? x.data?.tags ?? []).includes("so-v29-s6h")))) {
  const response = await fetch("/api/characters/delete", { method: "POST", headers: ctx.getRequestHeaders(), body: JSON.stringify({ avatar_url: c.avatar, delete_chats: true }) });
  if (!response.ok) throw new Error("card delete failed for " + c.name + ": " + response.status);
  removed.cards.push(c.avatar);
}
await ctx.getCharacters();
return removed;
