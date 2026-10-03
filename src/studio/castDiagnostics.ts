import type { StoryV2 } from "@engine/index";
import { castMemberName, isCastMember } from "@engine/index";
import { memberIsPlayer, playerRoles, rosterMemberIsPlayer, storyPlayerTexts } from "./playerRole";

type CastCode = "cast-member-no-card" | "background-missing" | "roster-member-is-player" | "cast-change-unknown-member" | "requirement-persona-missing"
  | "cast-member-never-enabled";

export const CAST_CONSEQUENCES: Record<CastCode, string> = {
  "cast-member-no-card": "This character never joins the scene: there is no card by that name, so it cannot be switched on and the story never reads as ready.",
  "background-missing": "The scene does not change: the install has no background by that name.",
  "roster-member-is-player": "Another character speaks as the player: the story casts the player's own role as someone else.",
  "cast-change-unknown-member": "This cast change switches nobody on or off: the name matches no cast member, so whoever it meant stays as they are.",
  "requirement-persona-missing": "The story never reads as ready, so its start effects never run: it requires a persona this install does not have, and nothing creates one.",
  "cast-member-never-enabled": "This character stays muted for the rest of the story: a checkpoint switches them off and no checkpoint switches them back on.",
};

export interface InstallFacts {
  characterNames?: () => readonly string[];
  backgroundNames?: () => readonly string[];
  personaNames?: () => readonly string[];
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

const castChangeNames = (draft: StoryV2): Array<{ name: string; path: string }> => draft.checkpoints.flatMap((checkpoint, index) => {
  const changes = checkpoint.effects?.cast_changes as { enable?: unknown; disable?: unknown } | undefined;
  return (["enable", "disable"] as const).flatMap((side) =>
    strings(changes?.[side]).map((name, position) => ({ name, path: `checkpoints.${index}.effects.cast_changes.${side}.${position}` })));
});

const castNames = (draft: StoryV2): Array<{ name: string; path: string }> => [
  ...castChangeNames(draft),
  ...(draft.requirements?.members ?? []).map((name, position) => ({ name, path: `requirements.members.${position}` })),
].map((entry) => ({ ...entry, name: castMemberName(draft.roster, entry.name) }));

export const checkCastChangeMembers = ({ draft, push }: CastRun) => {
  castChangeNames(draft).filter(({ name }) => !isCastMember(draft.roster, name)).forEach(({ name, path }) => {
    push("cast-change-unknown-member", "warning", path, `'${name}' is not in the cast: no cast member has that name or id`);
  });
};

export const checkNeverEnabled = ({ draft, push }: CastRun) => {
  const enabled = new Set(draft.checkpoints.flatMap((checkpoint) => strings((checkpoint.effects?.cast_changes as { enable?: unknown } | undefined)?.enable))
    .map((name) => castMemberName(draft.roster, name).trim().toLowerCase()));
  const reported = new Set<string>();
  draft.checkpoints.forEach((checkpoint, index) => {
    strings((checkpoint.effects?.cast_changes as { disable?: unknown } | undefined)?.disable).forEach((raw, position) => {
      const name = castMemberName(draft.roster, raw);
      const key = name.trim().toLowerCase();
      if (!isCastMember(draft.roster, name) || enabled.has(key) || reported.has(key)) return;
      reported.add(key);
      push(
        "cast-member-never-enabled",
        "warning",
        `checkpoints.${index}.effects.cast_changes.disable.${position}`,
        `'${name}' is switched off here and no checkpoint switches them on again; add them to cast_changes.enable at the checkpoint where they enter`,
      );
    });
  });
};

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
  const pictures: Array<[string, string | undefined]> = [
    ["briefing.image", draft.briefing?.image],
    ...(draft.chapters ?? []).map((chapter, index): [string, string | undefined] => [`chapters.${index}.briefing.image`, chapter.briefing?.image]),
  ];
  pictures.forEach(([path, name]) => {
    if (!name || stems.has(stem(name))) return;
    push("background-missing", "warning", path, `no background '${name}' on this install for the briefing picture; pick one from its list, or leave the picture out`);
  });
};

export const checkRequiredPersonas = ({ draft, context, push }: CastRun) => {
  const personas = known(context.personaNames);
  if (!personas) return;
  (draft.requirements?.personas ?? []).forEach((name, index) => {
    if (!name.trim() || personas.has(name.trim().toLowerCase())) return;
    push(
      "requirement-persona-missing",
      "warning",
      `requirements.personas.${index}`,
      `no persona named '${name}' on this install, and the wizard never creates personas; remove it from Requirements, or create that persona in SillyTavern`,
    );
  });
};

export const checkPlayerInRoster = ({ draft, push }: CastRun) => {
  const roles = playerRoles(storyPlayerTexts(draft));
  const personas = draft.requirements?.personas ?? [];
  draft.roster.forEach((member, index) => {
    const match = memberIsPlayer(member, roles, personas);
    if (!match && !rosterMemberIsPlayer(member, draft)) return;
    const how = !match ? "it is marked as the player" : match.persona ? "it is the player's persona" : `the story addresses the player as '${match.role}'`;
    push("roster-member-is-player", "warning", `roster.${index}`, `'${member.name ?? member.id}' is the player (${how}); the player is never a cast member, so remove it`);
  });
};

