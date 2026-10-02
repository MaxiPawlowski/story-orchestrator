import type { StoryV2 } from "@engine/index";
import { memberIsPlayer, playerRoles, storyPlayerTexts } from "./playerRole";

type CastCode = "cast-member-no-card" | "background-missing" | "roster-member-is-player";

export interface InstallFacts {
  characterNames?: () => readonly string[];
  backgroundNames?: () => readonly string[];
}

export interface CastRun {
  draft: StoryV2;
  context: InstallFacts;
  push: (code: CastCode, severity: "warning", path: string, message: string) => void;
}

const known = (read: (() => readonly string[]) | undefined): Set<string> | null => {
  const names = read?.() ?? [];
  return names.length ? new Set(names.map((name) => name.trim().toLowerCase())) : null;
};

const strings = (value: unknown): string[] => (Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : []);

const castNames = (draft: StoryV2): Array<{ name: string; path: string }> => [
  ...draft.checkpoints.flatMap((checkpoint, index) => {
    const changes = checkpoint.effects?.cast_changes as { enable?: unknown; disable?: unknown } | undefined;
    return (["enable", "disable"] as const).flatMap((side) =>
      strings(changes?.[side]).map((name, position) => ({ name, path: `checkpoints.${index}.effects.cast_changes.${side}.${position}` })));
  }),
  ...(draft.requirements?.members ?? []).map((name, position) => ({ name, path: `requirements.members.${position}` })),
];

export const checkCastCards = ({ draft, context, push }: CastRun) => {
  const cards = known(context.characterNames);
  if (!cards) return;
  castNames(draft).filter(({ name }) => !cards.has(name.trim().toLowerCase())).forEach(({ name, path }) => {
    push("cast-member-no-card", "warning", path, `no card named '${name}' on this install; create it, or use the card's exact name`);
  });
};

const stem = (name: string) => name.trim().toLowerCase().replace(/\.[a-z0-9]{2,5}$/, "");

const backgroundName = (value: unknown): string | null => {
  if (typeof value === "string") return value;
  return value && typeof value === "object" && typeof (value as { name?: unknown }).name === "string" ? (value as { name: string }).name : null;
};

export const checkBackgrounds = ({ draft, context, push }: CastRun) => {
  const files = known(context.backgroundNames);
  if (!files) return;
  const stems = new Set([...files].map(stem));
  draft.checkpoints.forEach((checkpoint, index) => {
    const name = backgroundName(checkpoint.effects?.background);
    if (!name || stems.has(stem(name))) return;
    push("background-missing", "warning", `checkpoints.${index}.effects.background`, `no background '${name}' on this install; pick one from its list, or leave the background out`);
  });
};

export const checkPlayerInRoster = ({ draft, push }: CastRun) => {
  const roles = playerRoles(storyPlayerTexts(draft));
  const personas = draft.requirements?.personas ?? [];
  draft.roster.forEach((member, index) => {
    const match = memberIsPlayer(member, roles, personas);
    if (!match) return;
    const how = match.persona ? "it is the player's persona" : `the story addresses the player as '${match.role}'`;
    push("roster-member-is-player", "warning", `roster.${index}`, `'${member.name ?? member.id}' is the player (${how}); the player is never a cast member, so remove it`);
  });
};

