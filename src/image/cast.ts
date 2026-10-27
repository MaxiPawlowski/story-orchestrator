import type { Checkpoint, IllustrationLook, NormalizedStory, RosterMember } from "@engine/index";
import type { ImageScene } from "./prompt";
import { cardValues, publicLook } from "@engine/cardFields";
import type { PrimitiveValue } from "@engine/index";

const NARRATOR_ROLE = /^\s*(?:the\s+|a\s+|an\s+)?(?:narrator|storyteller|game\s*master|gm|dm|dungeon\s*master|system)\b/i;

export const isNarratorMember = (member: Pick<RosterMember, "role" | "view">): boolean =>
  member.view === "omniscient" || NARRATOR_ROLE.test(member.role ?? "");

export const beatLabel = (checkpoint: Pick<Checkpoint, "player_name"> | null | undefined): string | null =>
  checkpoint?.player_name?.trim() || null;

export const cueText = (kind: "checkpoint" | "scene", label: string | null): string =>
  kind === "checkpoint" ? (label ? `Establishing shot of ${label}.` : "Establishing shot of the current scene.") : label ? `The scene moves to ${label}.` : "A new scene begins.";

export const sceneCueLabel = (reason: string, location: string | null | undefined): string | null =>
  reason === "location" ? location?.trim() || null : null;

export const beatIllustrated = (story: NormalizedStory | null, checkpointId: string | null): boolean =>
  !checkpointId || story?.checkpointById[checkpointId]?.illustrate !== false;

export const stageAlreadySet = (story: NormalizedStory | null, checkpointId: string | null): boolean => {
  const effects = checkpointId ? story?.checkpointById[checkpointId]?.effects : undefined;
  return Boolean(effects?.background?.name || effects?.stage);
};

export const backgroundPlace = (name: string | null | undefined): string | null => name?.replace(/\.[a-z0-9]+$/i, "").replace(/[_-]+/g, " ").trim() || null;

export const authoredPlace = (story: NormalizedStory | null, path: readonly string[]): string | null => {
  for (const id of [...path].reverse()) {
    const name = story?.checkpointById[id]?.effects?.background?.name;
    if (name) return backgroundPlace(name);
  }
  return null;
};

export const lookFor = (story: NormalizedStory | null, checkpointId: string | null): IllustrationLook => {
  const base = story?.illustrations;
  const chapterId = checkpointId ? story?.chapterByCheckpoint?.[checkpointId] : undefined;
  const chapter = chapterId ? story?.chapterById?.[chapterId]?.illustrations : undefined;
  const style = chapter?.style ?? base?.style;
  const appearances = { ...base?.appearances, ...chapter?.appearances };
  return { ...(style ? { style } : {}), ...(Object.keys(appearances).length ? { appearances } : {}) };
};

export const castForImage = (subjects: ImageScene["subjects"], story: NormalizedStory | null, look: IllustrationLook, values: Record<string, PrimitiveValue> = {}): ImageScene["subjects"] => {
  if (!story) return subjects;
  return subjects.flatMap((subject) => {
    const member = story.roster.find((entry) => (entry.name ?? entry.id).toLowerCase() === subject.name.toLowerCase());
    const authored = member ? look.appearances?.[member.id] : undefined;
    if (member && isNarratorMember(member) && (authored || subject.described)) return [];
    const changed = member ? publicLook(cardValues(story, values, member.id, true)) : "";
    const base = authored ?? (subject.described ? "" : subject.appearance);
    if (changed) return [{ ...subject, appearance: base ? `${base}. Current appearance overrides: ${changed}` : `Current appearance: ${changed}`, described: false }];
    if (authored) return [{ ...subject, appearance: authored, described: false }];
    return [subject];
  });
};
