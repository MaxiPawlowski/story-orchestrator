import type { RuntimeManager } from "@runtime/runtimeManager";
import { StoryImageDirector } from "./runtime";
import { onGenerationStart, registerImageSurface } from "@services/stHost/imageSurface";
import { setImageHealth } from "@runtime/imageHealth";
import { imageRows } from "./imageRowsHost";

let image: StoryImageDirector | null = null;
let dispose: (() => void) | null = null;

export function startImage(manager: RuntimeManager): StoryImageDirector {
  if (image) return image;
  image = new StoryImageDirector(manager);
  globalThis.storyOrchestratorImage = image;
  const stop = image.start();
  const unmount = registerImageSurface(image, (listener) => manager.subscribe(listener));
  const offRows = onGenerationStart((type, dryRun) => imageRows.post(type, dryRun));
  dispose = () => { offRows(); unmount(); stop(); };
  return image;
}

export function stopImage(): void {
  setImageHealth(null);
  dispose?.();
  dispose = null;
  image = null;
  Reflect.deleteProperty(globalThis, "storyOrchestratorImage");
}
