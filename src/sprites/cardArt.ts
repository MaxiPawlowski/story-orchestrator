import type { PixelImage } from "./builder/pixels";
import type { VisualSources } from "./visualManifest";

export const ST_DEFAULT_AVATAR = "/img/ai4.png";
export const PLACEHOLDER_ART = "This card still shows SillyTavern's default picture. Give the card its own art before building a base from it.";

export async function refuseDefaultCardArt(image: PixelImage, decode: (path: string) => Promise<PixelImage>, check = true): Promise<void> {
  if (!check) return;
  const placeholder = await decode(ST_DEFAULT_AVATAR).catch(() => null);
  if (placeholder && placeholderArt(image, placeholder)) throw new Error(PLACEHOLDER_ART);
}

export function placeholderArt(image: PixelImage, placeholder: PixelImage): boolean {
  if (image.width !== placeholder.width || image.height !== placeholder.height) return false;
  for (let k = 0; k < image.width * image.height; k += 37) {
    for (let c = 0; c < 3; c++) if (Math.abs(image.data[k * 4 + c] - placeholder.data[k * 4 + c]) > 2) return false;
  }
  return true;
}

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
