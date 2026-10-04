import type { Checkpoint, IllustrationLook, NormalizedStoryV2, RosterMember } from "@engine/index";
import type { ImageScene } from "./prompt";
import { cardValues, publicLook } from "@engine/cardFields";
import type { PrimitiveValue } from "@engine/index";

const NARRATOR_ROLE = /^\s*(?:the\s+|a\s+|an\s+)?(?:narrator|storyteller|game\s*master|gm|dm|dungeon\s*master|system)\b/i;

export const isNarratorMember = (member: Pick<RosterMember, "role" | "view">): boolean =>
  member.view === "omniscient" || NARRATOR_ROLE.test(member.role ?? "");

export const beatLabel = (checkpoint: Pick<Checkpoint, "player_name"> | null | undefined): string | null =>
  checkpoint?.player_name?.trim() || null;

export const cueText = (kind: "checkpoint" | "scene", label: string | null): string =>
  kind === "checkpoint" ? (label ? `Establishing shot of ${label}.` : "Establishing shot of the current scene.") : `The scene moves to ${label ?? "a new place"}.`;

export const beatIllustrated = (story: NormalizedStoryV2 | null, checkpointId: string | null): boolean =>
  !checkpointId || story?.checkpointById[checkpointId]?.illustrate !== false;

export const lookFor = (story: NormalizedStoryV2 | null, checkpointId: string | null): IllustrationLook => {
  const base = story?.illustrations;
  const chapterId = checkpointId ? story?.chapterByCheckpoint?.[checkpointId] : undefined;
  const chapter = chapterId ? story?.chapterById?.[chapterId]?.illustrations : undefined;
  const style = chapter?.style ?? base?.style;
  const appearances = { ...base?.appearances, ...chapter?.appearances };
  return { ...(style ? { style } : {}), ...(Object.keys(appearances).length ? { appearances } : {}) };
};

export const castForImage = (subjects: ImageScene["subjects"], story: NormalizedStoryV2 | null, look: IllustrationLook, values: Record<string, PrimitiveValue> = {}): ImageScene["subjects"] => {
  if (!story) return subjects;
  return subjects.flatMap((subject) => {
    const member = story.roster.find((entry) => (entry.name ?? entry.id).toLowerCase() === subject.name.toLowerCase());
    const authored = member ? look.appearances?.[member.id] : undefined;
    const changed = member ? publicLook(cardValues(story, values, member.id, true)) : "";
    if (changed) return [{ ...subject, appearance: `${authored ?? subject.appearance}. Current appearance overrides: ${changed}`, described: false }];
    if (authored) return [{ ...subject, appearance: authored, described: false }];
    if (member && isNarratorMember(member) && subject.described) return [];
    return [subject];
  });
};
