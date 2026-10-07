import type { PixelImage } from "./pixels";

export function referenceProblems(image: PixelImage): string[] {
  if (!Number.isInteger(image.width) || !Number.isInteger(image.height) || image.width < 8 || image.height < 8
    || image.data.length !== image.width * image.height * 4) return ["The reference image has invalid dimensions."];
  let transparent = false, visible = false;
  const colours = new Set<number>();
  for (let at = 0; at < image.data.length; at += 4) {
    const alpha = image.data[at + 3];
    transparent ||= alpha <= 8;
    visible ||= alpha > 8;
    if (alpha > 8 && colours.size < 8) colours.add((image.data[at] << 16) | (image.data[at + 1] << 8) | image.data[at + 2]);
  }
  return [!transparent || !visible ? "The reference needs a visible subject and a transparent background." : null,
    colours.size < 8 ? "The reference is blank or nearly single-colour." : null].filter((reason): reason is string => reason !== null);
}
