const cards = [{"name": "Brelan", "description": "Brelan is a packet-office clerk aged thirty, with dark hair and brown eyes. They hold the same rank, duties, shift hours, and access to information as the other two clerks. They work at the shared sorting counter.", "personality": "Attentive, cooperative, practical, and comfortable sharing routine responsibility.", "scenario": "Three equal-duty clerks are working the same shift at Orraven's packet office. They share the sorting counter, dispatch list, and responsibility for checking and routing sealed deliveries.", "first_mes": "The next batch is here. We can check the list before we send it out.", "mes_example": ""}, {"name": "Nerik", "description": "Nerik is a packet-office clerk aged thirty, with fair hair and grey eyes. They hold the same rank, duties, shift hours, and access to information as the other two clerks. They work at the shared sorting counter.", "personality": "Attentive, cooperative, practical, and comfortable sharing routine responsibility.", "scenario": "Three equal-duty clerks are working the same shift at Orraven's packet office. They share the sorting counter, dispatch list, and responsibility for checking and routing sealed deliveries.", "first_mes": "The next batch is here. We can check the list before we send it out.", "mes_example": ""}, {"name": "Veska", "description": "Veska is a packet-office clerk aged thirty, with auburn hair and hazel eyes. They hold the same rank, duties, shift hours, and access to information as the other two clerks. They work at the shared sorting counter.", "personality": "Attentive, cooperative, practical, and comfortable sharing routine responsibility.", "scenario": "Three equal-duty clerks are working the same shift at Orraven's packet office. They share the sorting counter, dispatch list, and responsibility for checking and routing sealed deliveries.", "first_mes": "The next batch is here. We can check the list before we send it out.", "mes_example": ""}];
const group = "Group: S6H Clerks";
const creator = "story-orchestrator v29-02-s6h";
if (ctx.groups.some((g) => g.name === group)) throw new Error("the S6H group already exists: run teardown.js first");
for (const card of cards) if (ctx.characters.some((c) => c.name === card.name)) throw new Error("a card named " + card.name + " already exists");
const narrator = ctx.characters.find((c) => c.name === "DM Narrator");
if (!narrator) throw new Error("DM Narrator card missing on this install");
const avatars = [];
for (const card of cards) {
  const body = { ch_name: card.name, description: card.description, personality: card.personality, scenario: card.scenario, first_mes: card.first_mes, mes_example: card.mes_example, creator_notes: "v2.9 02 S6 harder measurement card; remove with teardown.js", system_prompt: "", post_history_instructions: "", creator, character_version: "1", tags: ["so-v29-s6h"], talkativeness: "0.5", world: "", depth_prompt_prompt: "", depth_prompt_depth: "4", depth_prompt_role: "system", fav: "false", alternate_greetings: [], extensions: "{}" };
  const response = await fetch("/api/characters/create", { method: "POST", headers: ctx.getRequestHeaders(), body: JSON.stringify(body) });
  if (!response.ok) throw new Error("create failed for " + card.name + ": " + response.status);
  avatars.push((await response.text()).trim());
}
await ctx.getCharacters();
const response = await fetch("/api/groups/create", { method: "POST", headers: ctx.getRequestHeaders(), body: JSON.stringify({ name: group, members: [...avatars, narrator.avatar], activation_strategy: 2, generation_mode: 0, allow_self_responses: true, disabled_members: [], fav: false }) });
const created = await response.json();
if (!response.ok || !created.id) throw new Error("group create failed: " + response.status);
await ctx.getCharacters();
return { group: created.id, avatars, narrator: narrator.avatar };
