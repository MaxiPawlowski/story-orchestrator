import type { StoryPlayer, StoryV2 } from "./schema";

export const PLAYER_REF_MACRO = "{{user}}";

type PlayerStory = Pick<StoryV2, "player" | "requirements">;

const clean = (text: string | undefined): string => (text ?? "").trim().replace(/\s+/g, " ");

export const renderPlayerRoleLine = (role: string | undefined, summary: string | undefined): string | null => {
  const who = clean(role);
  const about = clean(summary);
  if (!who && !about) return null;
  if (!who) return `In this story, ${PLAYER_REF_MACRO}: ${about}`;
  return about ? `In this story, ${PLAYER_REF_MACRO} is ${who}: ${about}` : `In this story, ${PLAYER_REF_MACRO} is ${who}.`;
};

export const playerRoleLine = (player: StoryPlayer | undefined): string | null => (player ? renderPlayerRoleLine(player.role, player.summary) : null);

export const playerInjects = (player: StoryPlayer | undefined): boolean => Boolean(player && player.inject !== false && playerRoleLine(player));

export const carriesPlayerRoleLine = (description: string, line: string | null, personaName = ""): boolean => {
  if (!line || !description) return false;
  if (description.includes(line)) return true;
  const named = personaName.trim();
  return Boolean(named) && description.includes(line.split(PLAYER_REF_MACRO).join(named));
};

export const fixedPlayerName = (story: PlayerStory | null | undefined): string | null => {
  const name = story?.player?.name;
  return name?.mode === "fixed" && name.value?.trim() ? name.value.trim() : null;
};

export const createdPersonaDescription = (player: StoryPlayer | undefined): string => {
  const line = playerRoleLine(player);
  const body = (player?.suggested_description ?? "").trim();
  if (!line) return body;
  return body.includes(line) ? body : [line, body].filter(Boolean).join("\n\n");
};

export const hasPlayerProfile = (story: PlayerStory | null | undefined): boolean => {
  const player = story?.player;
  return Boolean(player && (player.role || player.summary || player.assumes?.length || player.name));
};

export const storyPlayerNames = (story: PlayerStory | null | undefined): string[] => {
  const fixed = fixedPlayerName(story);
  return [...(story?.requirements?.personas ?? []), ...(fixed ? [fixed] : [])];
};
