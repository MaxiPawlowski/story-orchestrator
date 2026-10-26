import type { NormalizedStory } from "@engine/index";
import { publicLook } from "@engine/cardFields";
import { directorView, type VisualScene } from "../sprites/packs/scene";
import { isNarratorMember } from "./cast";
import type { ImageReply, ImageScene } from "./prompt";

export const visualMembers = (subjects: ImageScene["subjects"], story: Pick<NormalizedStory, "roster">): string[] =>
  subjects.flatMap((subject) => {
    const member = story.roster.find((row) => (row.name ?? row.id).toLowerCase() === subject.name.toLowerCase());
    return member && !isNarratorMember(member) ? [member.id] : [];
  });

export function withVisualScene(scene: ImageScene, visual: VisualScene): ImageScene {
  const view = directorView(visual);
  const subjects = scene.subjects.map((subject) => {
    const packed = view.subjects.find((row) => row.name.toLowerCase() === subject.name.toLowerCase());
    if (!packed) return subject;
    const look = publicLook(packed.look);
    return { ...subject, appearance: look ? `${packed.tags.join(", ")}. Current appearance: ${look}` : packed.tags.join(", "), identityTags: packed.tags, described: false };
  });
  const place = visual.place.source === "pack" && view.place ? view.place : null;
  return {
    ...scene, subjects,
    ...(place ? { location: place.name, placeDetail: [place.description?.replace(/[\s.]+$/, ""), place.tags.join(", ")].filter(Boolean).join(". ") } : {}),
  };
}

export function pinnedTags(scene: ImageScene, reply: ImageReply | null): string[] {
  const visible = new Set((reply?.visible ?? []).map((name) => name.toLowerCase()));
  const shown = scene.subjects.filter((subject) => subject.identityTags?.length && (!visible.size || visible.has(subject.name.toLowerCase())));
  const already = new Set((reply?.prompt ?? "").toLowerCase().split(",").map((tag) => tag.trim()));
  return [...new Set(shown.flatMap((subject) => subject.identityTags ?? []))].filter((tag) => !already.has(tag.toLowerCase()));
}
