import React from "react";
import { createRoot } from "react-dom/client";
import type { RuntimeManager } from "@runtime/runtimeManager";
import { SpriteStage } from "./stage";
import { VnStage } from "./VnStage";
import { ROOT_OPTIONS } from "@utils/mountRegistry";

let stage: SpriteStage | null = null;
let dispose: (() => void) | null = null;

export function startSprites(manager: RuntimeManager): SpriteStage {
  if (stage) return stage;
  const current = new SpriteStage(manager);
  stage = current;
  if (__SO_DEV__) globalThis.storyOrchestratorSprites = current;
  const stop = current.start();
  const host = document.createElement("div");
  host.id = "so-vn-root";
  document.body.appendChild(host);
  const root = createRoot(host, ROOT_OPTIONS);
  root.render(<VnStage stage={current} />);
  dispose = () => {
    stop();
    root.unmount();
    host.remove();
  };
  return current;
}

export function stopSprites(): void {
  dispose?.();
  dispose = null;
  stage = null;
  if (__SO_DEV__) Reflect.deleteProperty(globalThis, "storyOrchestratorSprites");
}
