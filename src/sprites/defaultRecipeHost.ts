import { log } from "@utils/log";
import { defaultRecipe, resolveDefaultRecipe, setDefaultRecipe } from "./defaultRecipe";
import type { SpriteSettings } from "./settings";

let rerun: (() => Promise<void>) | null = null;
export const retryDefaultRecipe = async (): Promise<void> => { await rerun?.(); };

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
  const mine = () => run().catch((error: unknown) => log.warn("The install-wide Qwen route could not be checked", error));
  rerun = mine;
  void mine();
  return () => { stopped = true; if (rerun === mine) rerun = null; };
}
