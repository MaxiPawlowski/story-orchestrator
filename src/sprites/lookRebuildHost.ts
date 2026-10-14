import { getGlobalSettings, setGlobalSettings } from "@runtime/settingsStore";
import type { RunOwnership } from "@runtime/runToken";
import { spriteFileFingerprint, saveGeneratedSprite } from "@services/stHost/media";
import { spriteVisualCardPresent } from "@services/stHost/sprites";
import { contentHash } from "./builder/recipes";
import { cropBust } from "./visualHost";
import { visualSourceAccepted } from "./visualChanges";
import { liveHeadKey } from "./liveHeadRefs";
import { manifestRef } from "./liveHead/manifest";
import { rehomeHead, synthesizeCheckedHead, type LandmarkProvider } from "./liveHead/synthesis/synthesize";
import { rigSynthesisDeps } from "./liveHead/synthesis/host";
import { LookRebuild, LOOK_BUST_RECIPE, replaceRig } from "./lookRebuild";

export function createLookRebuild(ownership: RunOwnership, landmarks?: LandmarkProvider): LookRebuild {
  const synthesis = rigSynthesisDeps(landmarks);
  return new LookRebuild({
    ownership, read: (character) => getGlobalSettings().sprites.visualSources[character], present: spriteVisualCardPresent,
    fingerprint: spriteFileFingerprint, crop: cropBust,
    hash: (value) => contentHash(new TextEncoder().encode(value)),
    synthesize: (input, run) => synthesizeCheckedHead(input, run, synthesis),
    rehome: rehomeHead,
    save: async (review, signal) => {
      signal.throwIfAborted();
      if (!review.bust.data) throw new Error("This look's bust is already saved.");
      const saved = await saveGeneratedSprite({ character: review.target.character, set: `visual_${review.bust.key.slice(0, 16)}`, label: "bust",
        data: review.bust.data, key: review.bust.key, recipe: LOOK_BUST_RECIPE, qa: { ok: true, authorReviewed: true },
        inputs: { base: review.base.sha256, box: review.box, root: review.root, look: review.target.look }, signal });
      if (!saved.ok) throw new Error(saved.reason);
      return { path: saved.path, sha256: saved.sha256, key: review.bust.key, recipe: LOOK_BUST_RECIPE };
    },
    commitBust: (source, run) => {
      if (!run.stillOwns()) throw new Error("The draft changed before this bust could be accepted.");
      const settings = getGlobalSettings().sprites;
      setGlobalSettings({ sprites: { visualSources: { ...settings.visualSources, [source.character]: source } } });
      visualSourceAccepted();
    },
    commitRig: (manifest, run) => {
      if (!run.stillOwns()) throw new Error("The draft changed before this rig could be accepted.");
      const ref = manifestRef(manifest);
      if (ref.manifest.length > 24_000_000) throw new Error("Rig package is too large.");
      setGlobalSettings({ sprites: { liveHeadRigs: replaceRig(getGlobalSettings().sprites.liveHeadRigs, ref, liveHeadKey(ref)) } });
      visualSourceAccepted();
    },
  });
}
