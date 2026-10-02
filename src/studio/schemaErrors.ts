import type { StoryV2 } from "@engine/index";

const SCHEMA_CONSEQUENCES: Array<[RegExp, string]> = [
  [/no reachable anchor/i, "A player who reaches this checkpoint can never reach a turning point after it, so the story cannot be saved."],
  [/unknown checkpoint/i, "This transition leads to or from a checkpoint that does not exist, so it can never fire."],
  [/unknown anchor/i, "This points at a turning point that does not exist, so it never counts toward anything."],
  [/unknown quality/i, "This sets a quality the story does not declare, so the value goes nowhere."],
  [/only one checkpoint may be start/i, "The story cannot tell where it opens."],
  [/at least one checkpoint is required/i, "The story has nowhere to begin."],
  [/is required|must be/i, "The story cannot be saved until this field is filled in correctly."],
];

export const SCHEMA_FALLBACK = "The story cannot be saved until this is fixed, so none of this edit reaches a chat.";

export const schemaConsequence = (message: string): string => SCHEMA_CONSEQUENCES.find(([pattern]) => pattern.test(message))?.[1] ?? SCHEMA_FALLBACK;

type Located = { name?: string; id?: string; key?: string };

const pick = <T extends Located>(list: readonly T[], ref: string | undefined): T | undefined => {
  if (ref === undefined) return undefined;
  const index = Number(ref);
  return Number.isInteger(index) && String(index) === ref ? list[index] : list.find((entry) => entry.id === ref || entry.key === ref);
};

const checkpointName = (draft: StoryV2, id: string) => draft.checkpoints.find((checkpoint) => checkpoint.id === id)?.name ?? id;

export const placeOf = (draft: StoryV2, path: string): string => {
  const [collection, ref, ...rest] = path.split(".");
  const tail = rest.length ? ` · ${rest.join(".")}` : "";
  if (collection === "checkpoints") {
    const checkpoint = pick(draft.checkpoints, ref);
    if (checkpoint) return `Checkpoint "${checkpoint.name}"${tail}`;
  }
  if (collection === "transitions") {
    const index = Number(ref);
    const transition = Number.isInteger(index) ? draft.transitions[index] : undefined;
    if (transition) return `Transition ${checkpointName(draft, transition.from)} → ${checkpointName(draft, transition.to)}${tail}`;
  }
  if (collection === "qualities") {
    const quality = pick(draft.qualities, ref);
    if (quality) return `Quality "${quality.key}"${tail}`;
  }
  if (collection === "roster") {
    const member = pick(draft.roster, ref);
    if (member) return `Cast member "${member.name ?? member.id}"${tail}`;
  }
  return path;
};
