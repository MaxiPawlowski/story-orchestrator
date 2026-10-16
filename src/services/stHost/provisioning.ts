import { getContext } from "./context";
import type { HostCharacter } from "./hostTypes";
import { cardReadBack, type CardReadBack, type CardReadBackState, type ReadBackAnswer, type SentCard } from "@utils/cardReadBack";
import { couldNot, wrote, type WriteResult } from "@utils/writeResult";

// Provisioning writes to the user's real install, so every call here goes through an endpoint ST
// itself uses, with ST's own request headers, and finishes by reloading ST's caches. Verified host
// facts (see docs/plans 00-implementation-overview.md §Verified ST host facts):
//   - POST /api/characters/create, JSON body, returns the avatar filename as text
//   - POST /api/characters/get {avatar_url}, 404 when the file is missing, else the card JSON with top-level
//     name/description/personality/scenario/first_mes/mes_example (src/endpoints/characters.js:1480, :580-585;
//     public/script.js:1224 getOneCharacter); a card that cannot be parsed answers 200 without a name (:432)
//     (public/scripts/slash-commands.js:5237, public/scripts/welcome-screen.js:869;
//      server: src/endpoints/characters.js:1024 — `if (!request.file)` writes the default avatar)
//   - POST /api/groups/create, JSON body, returns the created group object
//     (public/scripts/group-chats.js:2119; server: src/endpoints/groups.js:156 returns groupMetadata)
//   - getContext().getRequestHeaders / .getCharacters / .humanizedDateTime
//     (public/scripts/st-context.js:129 / :230 / :237). getCharacters() also reloads groups
//     (public/script.js:1326), which is why one call refreshes both lists.

export interface CharacterCardInput {
  name: string;
  description: string;
  personality?: string;
  scenario?: string;
  first_mes?: string;
  mes_example?: string;
  tags?: string[];
}

const requestHeaders = (): Record<string, string> => {
  const headers = getContext().getRequestHeaders?.();
  if (!headers) throw new Error("SillyTavern did not expose getRequestHeaders — cannot create assets safely.");
  return headers;
};

// One reload refreshes characters *and* groups, so a created card is immediately selectable and a
// created group is immediately in `context.groups`.
const reloadHostLists = async () => {
  await getContext().getCharacters?.();
};

const chatStamp = (): string => getContext().humanizedDateTime?.() ?? new Date().toISOString().replace(/[:.]/g, "-");

export interface CreatedCharacterCard {
  avatar: string;
  name: string;
  readBack: CardReadBackState;
  lossy: string[];
}

const sentCard = (input: CharacterCardInput): SentCard => ({
  name: input.name.trim(), description: input.description ?? "", personality: input.personality ?? "", scenario: input.scenario ?? "",
  first_mes: input.first_mes ?? "", mes_example: input.mes_example ?? "",
});

const askCard = async (avatar: string): Promise<ReadBackAnswer | null> => {
  try {
    const response = await fetch("/api/characters/get", { method: "POST", headers: requestHeaders(), body: JSON.stringify({ avatar_url: avatar }) });
    return { ok: response.ok, body: response.ok ? await response.json() : null };
  } catch {
    return null;
  }
};

export async function readBackCharacterCard(avatar: string, input: CharacterCardInput): Promise<CardReadBack> {
  if (!avatar) return cardReadBack(sentCard(input), null);
  return cardReadBack(sentCard(input), await askCard(avatar));
}

export async function createCharacterCard(input: CharacterCardInput): Promise<WriteResult<CreatedCharacterCard>> {
  const body = {
    ch_name: input.name.trim(),
    description: input.description ?? "",
    first_mes: input.first_mes ?? "",
    personality: input.personality ?? "",
    scenario: input.scenario ?? "",
    mes_example: input.mes_example ?? "",
    creator_notes: "Created by the Story Orchestrator wizard.",
    system_prompt: "",
    post_history_instructions: "",
    creator: "Story Orchestrator",
    character_version: "",
    tags: input.tags ?? [],
    talkativeness: "0.5",
    world: "",
    depth_prompt_prompt: "",
    depth_prompt_depth: "4",
    depth_prompt_role: "system",
    fav: "false",
    alternate_greetings: [],
    extensions: "{}",
  };
  const response = await fetch("/api/characters/create", { method: "POST", headers: requestHeaders(), body: JSON.stringify(body) });
  if (!response.ok) return couldNot(`creating "${input.name}" failed: ${response.status} ${await response.text()}`);
  const avatar = (await response.text()).trim();
  const readBack = await readBackCharacterCard(avatar, input);
  await reloadHostLists();
  return wrote({ avatar, name: readBack.name ?? body.ch_name, readBack: readBack.state, lossy: readBack.lossy });
}

export function listGroupNames(): string[] {
  return (getContext().groups ?? [])
    .map((group) => (typeof group.name === "string" ? group.name.trim() : ""))
    .filter((name) => name.length > 0);
}

export function listGroupCasts(): Array<{ name: string; members: string[] }> {
  const characters = (getContext().characters ?? []) as HostCharacter[];
  const nameOf = (avatar: string) => characters.find((character) => character.avatar === avatar)?.name?.trim() ?? "";
  return (getContext().groups ?? []).flatMap((group) => {
    const name = typeof group.name === "string" ? group.name.trim() : "";
    const members = (Array.isArray(group.members) ? group.members : []).filter((avatar): avatar is string => typeof avatar === "string").map(nameOf).filter(Boolean);
    return name ? [{ name, members }] : [];
  });
}

const avatarForName = (name: string): string | null => {
  const search = name.trim().toLowerCase();
  const characters = (getContext().characters ?? []) as HostCharacter[];
  const found = characters.find((character) => character.name?.trim().toLowerCase() === search);
  return typeof found?.avatar === "string" ? found.avatar : null;
};

export async function createGroup(name: string, memberNames: string[]): Promise<{ id: string; name: string; members: string[] }> {
  const members = memberNames.map((member) => ({ member, avatar: avatarForName(member) }));
  const unknown = members.filter((entry) => !entry.avatar).map((entry) => entry.member);
  if (unknown.length) throw new Error(`No character card for ${unknown.join(", ")} — create the cards first.`);
  const stamp = chatStamp();
  const body = {
    name: name.trim(),
    members: members.map((entry) => entry.avatar as string),
    avatar_url: "img/ai4.png",
    allow_self_responses: false,
    activation_strategy: 0,
    generation_mode: 0,
    disabled_members: [],
    fav: false,
    chat_id: stamp,
    chats: [stamp],
    auto_mode_delay: 5,
  };
  const response = await fetch("/api/groups/create", { method: "POST", headers: requestHeaders(), body: JSON.stringify(body) });
  if (!response.ok) throw new Error(`Creating the group "${name}" failed: ${response.status} ${await response.text()}`);
  const created = await response.json() as { id?: unknown; name?: unknown };
  await reloadHostLists();
  return { id: String(created.id ?? ""), name: body.name, members: body.members };
}
