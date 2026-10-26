import { log } from "@utils/log";
import { defaultRecipe, resolveDefaultRecipe, setDefaultRecipe } from "./defaultRecipe";
import type { SpriteSettings } from "./settings";

export function startDefaultRecipe(read: () => SpriteSettings, changed: () => void): () => void {
  let stopped = false;
  const run = async () => {
    const media = await import("@services/stHost/media");
    const next = await resolveDefaultRecipe(read(), { discover: () => media.comfyDiscover(), fingerprint: (kind, name) => media.comfyFingerprint(kind, name) });
    if (stopped) return;
    const before = JSON.stringify(defaultRecipe().recipe);
    setDefaultRecipe(next, read());
    if (JSON.stringify(next.recipe) !== before) changed();
  };
  void run().catch((error: unknown) => log.warn("The install-wide Qwen route could not be checked", error));
  return () => { stopped = true; };
}
