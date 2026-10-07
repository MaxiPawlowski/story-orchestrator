// The toy group the scenario corpus plays in: the sun-ruins cast, pinned by NAME (scenario `requires.group`),
// because a group id is minted by the install that created the group and differs on a fresh one.
// adolion-fresh keeps it from the install copy, and creates it when the copy lacks it (scripts/debug/adolion-fresh.mts).

export const TOY_GROUP_NAME = 'Group: Arin, DM Narrator';
export const TOY_GROUP_MEMBERS = ['Luke.png', 'Ponticius.png', 'Arin.png', 'DM Narrator.png'];

/** The body /api/groups/create takes for the toy group (ST src/endpoints/groups.js, POST /create). */
export const toyGroupCreateBody = () => ({
  name: TOY_GROUP_NAME,
  members: [...TOY_GROUP_MEMBERS],
  avatar_url: 'img/ai4.png',
  allow_self_responses: false,
  activation_strategy: 0,
  generation_mode: 0,
  disabled_members: [],
  fav: false,
});

/** What keeps the toy group from being there as the corpus expects: duplicated, a member card missing, absent, or short a member. */
export function toyGroupProblems(groups, avatars) {
  const found = (groups ?? []).filter((group) => String(group?.name ?? '') === TOY_GROUP_NAME);
  if (found.length > 1) return [`toy group "${TOY_GROUP_NAME}": ${found.length} groups carry the name, want 1 (requires.group matches by name)`];
  const cards = new Set(avatars ?? []);
  const missingCards = TOY_GROUP_MEMBERS.filter((avatar) => !cards.has(avatar));
  if (missingCards.length) return [`toy group "${TOY_GROUP_NAME}": member card(s) missing: ${missingCards.join(', ')}`];
  if (!found.length) return [`toy group "${TOY_GROUP_NAME}" is missing`];
  const members = new Set((found[0].members ?? []).map(String));
  const missingMembers = TOY_GROUP_MEMBERS.filter((avatar) => !members.has(avatar));
  return missingMembers.length ? [`toy group "${TOY_GROUP_NAME}": not a member: ${missingMembers.join(', ')}`] : [];
}

/** A command-line argument quoted only when it needs to be (a group name carries spaces, a colon and a comma). */
export const shellArg = (value) => (/^[\w./:@<>-]+$/.test(String(value)) ? String(value) : `"${String(value).replace(/(["\\$`])/g, '\\$1')}"`);
