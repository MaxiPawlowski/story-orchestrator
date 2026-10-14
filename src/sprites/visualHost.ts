import { getGlobalSettings, setGlobalSettings } from "@runtime/settingsStore";
import type { RunGuard, RunOwnership } from "@runtime/runToken";
import { spriteFileFingerprint, saveGeneratedSprite } from "@services/stHost/media";
import { spriteVisualCardPresent } from "@services/stHost/sprites";
import { contentHash } from "./builder/recipes";
import { decodeImage, encodeImage } from "./builder/images";
import { validateBox } from "./builder/pixels";
import { VisualPreparation } from "./visualPreparation";
import { visualRoot, publishVisualLook, lookSignature, type VisualAsset, type VisualManifest } from "./visualManifest";
import { visualSourceAccepted } from "./visualChanges";

export async function verifyVisualSource(source: VisualManifest, signal: AbortSignal): Promise<void> {
  signal.throwIfAborted();
  if (!spriteVisualCardPresent(source.character, source.card.path)) throw new Error("The prepared character card is missing or was replaced.");
  const hashes = await Promise.all([source.card, source.base, source.bust].map((file) => spriteFileFingerprint(file.path, signal)));
  signal.throwIfAborted();
  if (hashes.some((hash, index) => hash !== [source.card, source.base, source.bust][index].sha256)) throw new Error("Prepared artwork changed. Review presentation again.");
}

export function createVisualPreparation(ownership: RunOwnership): VisualPreparation {
  return new VisualPreparation({
    ownership, read: (character) => getGlobalSettings().sprites.visualSources[character], present: spriteVisualCardPresent,
    fingerprint: spriteFileFingerprint,
    hash: (value) => contentHash(new TextEncoder().encode(value)),
    crop: async (path, box, signal) => {
      signal.throwIfAborted();
      const image = await decodeImage(path); validateBox(image, box);
      signal.throwIfAborted();
      const pixels = new Uint8ClampedArray(box.width * box.height * 4);
      for (let y = 0; y < box.height; y += 1) pixels.set(image.data.subarray(((box.y + y) * image.width + box.x) * 4, ((box.y + y) * image.width + box.x + box.width) * 4), y * box.width * 4);
      const data = encodeImage({ width: box.width, height: box.height, data: pixels });
      const bytes = Uint8Array.from(atob(data), (char) => char.charCodeAt(0));
      return { data, sha256: await contentHash(bytes) };
    },
    save: async (review, signal) => {
      signal.throwIfAborted();
      const recipe = { id: "visual-bust-crop", version: 1 };
      const saved = await saveGeneratedSprite({ character: review.input.character, set: `visual_${review.key.slice(0, 16)}`, label: "bust",
        data: review.data, key: review.key, recipe, qa: { ok: true, authorReviewed: true },
        inputs: { base: review.input.base.sha256, box: review.input.box }, signal });
      if (!saved.ok) throw new Error(saved.reason);
      return { path: saved.path, sha256: saved.sha256, key: review.key, recipe };
    },
    commit: (source, run) => {
      if (!run.stillOwns()) throw new Error("The draft changed before this source could be accepted.");
      const settings = getGlobalSettings().sprites;
      setGlobalSettings({ sprites: { visualSources: { ...settings.visualSources, [source.character]: source } } });
      visualSourceAccepted();
    },
  });
}

export function publishDerivedVisual(run: Pick<RunGuard, "stillOwns">, character: string, root: string, set: string, fields: Record<string, string>, base: VisualAsset): void {
  if (!run.stillOwns()) throw new Error("The story changed before this look could be published.");
  const settings = getGlobalSettings().sprites, source = settings.visualSources[character];
  if (!source) return;
  if (!spriteVisualCardPresent(character, source.card.path)) throw new Error("The prepared card is no longer installed.");
  const next = publishVisualLook(source, root, set, lookSignature(fields), base);
  setGlobalSettings({ sprites: { visualSources: { ...settings.visualSources, [character]: next } } });
}

export const sourceStillCurrent = (source: VisualManifest): boolean => {
  const current = getGlobalSettings().sprites.visualSources[source.character];
  return !!current && visualRoot(current) === visualRoot(source) && spriteVisualCardPresent(source.character, source.card.path);
};
