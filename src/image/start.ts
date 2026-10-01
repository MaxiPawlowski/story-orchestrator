import type { RuntimeManager } from "@runtime/runtimeManager";
import { StoryImageDirector } from "./runtime";
import { registerImageSurface } from "@services/stHost/imageSurface";

let image: StoryImageDirector | null = null;
let dispose: (() => void) | null = null;

export function startImage(manager: RuntimeManager): StoryImageDirector {
  if (image) return image;
  image = new StoryImageDirector(manager);
  if (__SO_DEV__) globalThis.storyOrchestratorImage = image;
  const stop = image.start();
  const unmount = registerImageSurface(image);
  dispose = () => { unmount(); stop(); };
  return image;
}

export function stopImage(): void {
  dispose?.();
  dispose = null;
  image = null;
  if (__SO_DEV__) Reflect.deleteProperty(globalThis, "storyOrchestratorImage");
}
