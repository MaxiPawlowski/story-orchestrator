import type { StoryV2 } from "@engine/index";
import { memberIsPlayer, playerRoles, storyPlayerTexts } from "../../studio/playerRole";
import type { AgentOp, AgentSession } from "./types";

const greetings = (session: AgentSession): string[] => session.steps.flatMap((step) => {
  const op = step.op;
  const kept = step.family === "provision" && step.status !== "rejected" && step.status !== "refused";
  return kept && op?.kind === "createCharacterCard" && op.first_mes ? [op.first_mes] : [];
});

const rolesFor = (session: AgentSession, draft: StoryV2, extra: string[]): string[] =>
  playerRoles([session.goal, ...storyPlayerTexts(draft), ...greetings(session), ...extra]);

const castName = (op: AgentOp): { name: string; greeting: string[] } | null => {
  if (op.kind === "createCharacterCard") return { name: op.name, greeting: op.first_mes ? [op.first_mes] : [] };
  if (op.kind === "addRosterMember") return { name: op.member.name ?? op.member.id, greeting: [] };
  return null;
};

export const playerCastProblem = (session: AgentSession, draft: StoryV2, op: AgentOp): string | null => {
  const cast = castName(op);
  if (!cast) return null;
  const match = memberIsPlayer({ id: cast.name, name: cast.name }, rolesFor(session, draft, cast.greeting), draft.requirements?.personas ?? []);
  if (!match) return null;
  const who = match.persona ? `"${cast.name}" is the player's persona` : `the player is the ${match.role} (the story addresses the player so)`;
  return `${who}; the player is never a card or a cast member. Cast only the characters the player meets`;
};

export const greetingClash = (draft: StoryV2, op: AgentOp): string | null => {
  if (op.kind !== "createCharacterCard" || !op.first_mes) return null;
  const roles = playerRoles([op.first_mes]);
  const member = draft.roster.find((entry) => memberIsPlayer(entry, roles));
  if (!member) return null;
  return `Note: this greeting makes the player the ${memberIsPlayer(member, roles)?.role}, while cast member "${member.name ?? member.id}" plays that role; remove that member (removeRosterMember) or address the player differently.`;
};
