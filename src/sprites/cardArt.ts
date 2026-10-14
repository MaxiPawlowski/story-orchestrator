import type { VisualSources } from "./visualManifest";

export type CardArt =
  | { state: "accepted"; folder: string; base: string; bust: string; revision: number; pack: boolean }
  | { state: "stale"; folder: string }
  | { state: "unprepared"; folder: string }
  | { state: "not-installed" };

export function cardArt(name: string, members: ReadonlyArray<{ name: string; folder: string; image?: string }>, sources: VisualSources,
  present: (folder: string, image: string) => boolean): CardArt {
  const wanted = name.trim().toLowerCase(), member = wanted ? members.find((row) => row.name.toLowerCase() === wanted) : undefined;
  if (!member) return { state: "not-installed" };
  const source = sources[member.folder];
  if (!source) return { state: "unprepared", folder: member.folder };
  if (!present(member.folder, source.card.path)) return { state: "stale", folder: member.folder };
  return { state: "accepted", folder: member.folder, base: source.base.path, bust: source.bust.path, revision: source.revision, pack: Boolean(source.pack) };
}
