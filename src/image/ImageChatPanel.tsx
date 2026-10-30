import { useEffect, useState } from "react";
import type { RuntimeManager } from "@runtime/index";
import type { RuntimeSnapshot } from "@runtime/types";
import { PLAYER_COPY } from "@runtime/narrative";
import { startImage } from "./start";
import { Button } from "@components/ui/Button";

export const IMAGE_QUICK_COPY = {
  label: "Illustrations",
  scene: "Illustrate scene",
  portrait: "Portrait",
  background: "Background",
  stop: "Stop images",
} as const;

export default function ImageChatPanel({ manager }: { manager: RuntimeManager; snapshot?: RuntimeSnapshot }) {
  const image = startImage(manager);
  const [, refresh] = useState(0);
  useEffect(() => image.subscribe(() => refresh((value) => value + 1)), [image]);
  if (!image.settings().enabled) return null;
  const state = image.status();
  return <div id="so-image-quick" data-so="image-quick" role="group" aria-label={IMAGE_QUICK_COPY.label} className="so-scene-quick">
    <Button size="sm" icon="fa-clapperboard" work={() => image.direct({ purpose: "scene", text: "", messageId: null })}>{IMAGE_QUICK_COPY.scene}</Button>
    <Button size="sm" icon="fa-user" work={() => image.direct({ purpose: "portrait", text: "", messageId: null })}>{IMAGE_QUICK_COPY.portrait}</Button>
    <Button size="sm" icon="fa-image" work={() => image.direct({ purpose: "background", text: "", messageId: null })}>{IMAGE_QUICK_COPY.background}</Button>
    {state.jobs.length > 0 && <Button size="sm" variant="ghost" icon="fa-stop" onClick={() => image.queue.cancelAll()}>{IMAGE_QUICK_COPY.stop}</Button>}
    {state.jobs.length > 0 && <span role="status" className="so-play-meta">{state.jobs.map((job) => `${job.label}: ${job.state}`).join(" · ")}</span>}
    {state.lastError && <span role="alert" data-so="image-error" className="so-play-meta so-error-text">{PLAYER_COPY.imageError}</span>}
  </div>;
}
