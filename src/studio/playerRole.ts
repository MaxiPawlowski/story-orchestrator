import { storyPlayerNames, type RosterMember, type StoryV2 } from "@engine/index";

const ADDRESS = /\b(?:you\s+are|you're|you\s+play(?:\s+as)?|the\s+player\s+(?:is|plays(?:\s+as)?)|the\s+player\s+character\s+is)\s+(?:a|an|the)\s+([\p{L}'-]+(?:\s+[\p{L}'-]+){0,2})/giu;

export const foldName = (text: string): string => text
  .toLowerCase()
  .replace(/[^\p{L}\p{N}' ]+/gu, " ")
  .replace(/\s+/g, " ")
  .trim()
  .replace(/^(?:the|a|an) /, "");

const prefixes = (phrase: string): string[] => {
  const words = foldName(phrase).split(" ").filter(Boolean);
  return words.map((_, index) => words.slice(0, index + 1).join(" "));
};

export const playerRoles = (texts: readonly string[]): string[] => [
  ...new Set(texts.flatMap((text) => [...text.matchAll(ADDRESS)].flatMap((match) => prefixes(match[1])))),
];

export const authoredPlayerRoles = (draft: Pick<StoryV2, "player">): string[] => (draft.player?.role ? prefixes(draft.player.role) : []);

export const storyPlayerRoles = (draft: StoryV2, extra: readonly string[] = []): string[] =>
  [...new Set([...authoredPlayerRoles(draft), ...playerRoles([...storyPlayerTexts(draft), ...extra])])];

export const storyPlayerTexts = (draft: StoryV2): string[] => {
  const openers = draft.checkpoints.flatMap((checkpoint) => checkpoint.effects?.npc_replies ?? []).map((reply) => reply.text ?? "");
  return [draft.description ?? "", draft.player_intro ?? "", draft.player?.summary ?? "", ...openers].filter(Boolean);
};

export interface PlayerMatch {
  role: string;
  persona: boolean;
}

export const memberIsPlayer = (member: Pick<RosterMember, "id" | "name">, roles: readonly string[], personas: readonly string[] = []): PlayerMatch | null => {
  const names = [member.name ?? "", member.id.replace(/_/g, " ")].map(foldName).filter(Boolean);
  const persona = personas.map(foldName).find((entry) => names.includes(entry));
  if (persona) return { role: persona, persona: true };
  const role = roles.find((entry) => names.includes(entry));
  return role ? { role, persona: false } : null;
};

const PLAYER_ROLE = /^\s*(?:the\s+)?player\b|\bplayer[ -](?:persona|character)\b/i;

export const rosterMemberIsPlayer = (member: RosterMember, draft: StoryV2): boolean =>
  memberIsPlayer(member, storyPlayerRoles(draft), storyPlayerNames(draft)) !== null
  || foldName(member.id) === "player"
  || PLAYER_ROLE.test(member.role ?? "");
