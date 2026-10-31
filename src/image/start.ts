import type { RuntimeManager } from "@runtime/runtimeManager";
import { StoryImageDirector } from "./runtime";
import { onGenerationStart, registerImageSurface } from "@services/stHost/imageSurface";
import { setImageHealth } from "@runtime/imageHealth";
import { imageRows } from "./imageRowsHost";
import { imageChatId } from "@services/stHost/image";
import { beginRun } from "@runtime/runToken";

let image: StoryImageDirector | null = null;
let dispose: (() => void) | null = null;

export function startImage(manager: RuntimeManager): StoryImageDirector {
  if (image) return image;
  image = new StoryImageDirector(manager);
  globalThis.storyOrchestratorImage = image;
  const stop = image.start();
  const unmount = registerImageSurface(image, (listener) => manager.subscribe(listener));
  const offRows = onGenerationStart((type, dryRun) => imageRows.post(type, dryRun));
  let swept: string | null = null;
  let sweeping = false;
  const sweepRows = () => {
    const chatId = imageChatId();
    if (!chatId || chatId === swept || sweeping) return;
    sweeping = true;
    const run = beginRun(manager.getOwnership());
    void imageRows.sweep(chatId, () => run.stillOwns() && imageChatId() === chatId)
      .then((result) => { if (result.done) swept = chatId; }, () => undefined)
      .finally(() => { sweeping = false; run.release(); });
  };
  sweepRows();
  const offSweep = manager.subscribe(sweepRows);
  dispose = () => { offSweep(); offRows(); unmount(); stop(); };
  return image;
}

export function stopImage(): void {
  setImageHealth(null);
  dispose?.();
  dispose = null;
  image = null;
  Reflect.deleteProperty(globalThis, "storyOrchestratorImage");
}
