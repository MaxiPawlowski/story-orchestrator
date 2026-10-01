import { useEffect, useState } from "react";
import type { RuntimeManager } from "@runtime/index";
import type { RuntimeSnapshot } from "@runtime/types";
import HelpTooltip from "@components/studio/HelpTooltip";
import { imageAutomationText, PLAYER_COPY } from "@runtime/narrative";
import { startImage } from "./start";
import type { ImageOverride } from "./settings";
import { CHECKPOINTS } from "./catalog";
import { log } from "@utils/log";

export default function ImageChatPanel({ manager, snapshot }: { manager: RuntimeManager; snapshot: RuntimeSnapshot }) {
  const image = startImage(manager);
  const [, refresh] = useState(0);
  useEffect(() => image.subscribe(() => refresh((value) => value + 1)), [image]);
  const settings = image.settings();
  const state = image.status();
  const override = image.override();
  const update = (patch: Partial<ImageOverride>) => {
    void image.setOverride({ ...override, ...patch }).catch((error: unknown) => {
      log.warn("image preference not saved", error);
      window.toastr?.info?.(PLAYER_COPY.imagePreferenceError);
    });
  };
  const cues = [snapshot.imageStory?.checkpoints && "each new turn in the story", snapshot.imageStory?.scenes && "confirmed scene changes"].filter(Boolean);
  const automation = imageAutomationText(settings.automation.mode, cues.filter((cue): cue is string => typeof cue === "string"), settings.automation.everyN);
  return <section id="so-image-chat" className="flex flex-col gap-2 border-t border-solid border-white/10 pt-2 text-sm">
    <div className="font-medium">Illustrations <span className="opacity-60 font-normal">— this chat</span></div>
    <div className="text-xs opacity-80">{settings.enabled ? automation : PLAYER_COPY.imageInstallOff} Manual images are still available.</div>
    <div className="flex items-center gap-2">
      <label className="flex items-center gap-2">
        <input type="checkbox" checked={override.paused} onChange={(event) => update({ paused: event.target.checked })} />
        Pause automatic images in this chat
      </label>
      <HelpTooltip title="Only this chat is paused. You can still request an image manually; other chats keep their own preference."
        href="/scripts/extensions/third-party/story-orchestrator/README.md#illustrations-and-scope" reference="Image preferences" />
    </div>
    <details className="text-xs"><summary className="cursor-pointer">Chat image preferences</summary>
      <div className="flex flex-col gap-2 pt-2">
        <label className="flex flex-col gap-1">Image model <select className="text_pole" value={override.checkpoint} onChange={(event) => update({ checkpoint: event.target.value })}>
          <option value="">Use the install route</option>{CHECKPOINTS.map((checkpoint) => <option key={checkpoint.file} value={checkpoint.file}>{checkpoint.label}</option>)}
        </select></label>
        <label className="flex flex-col gap-1">Quality <select className="text_pole" value={override.quality} onChange={(event) => update({ quality: event.target.value as ImageOverride["quality"] })}>
          <option value="">Use the route default</option><option value="base">Standard</option><option value="hires">High resolution</option>
        </select></label>
        <label className="flex flex-col gap-1">Extra visual direction
          <input className="text_pole" value={override.extraPositive} placeholder="This chat only"
            onChange={(event) => update({ extraPositive: event.target.value })} />
        </label>
      </div>
    </details>
    <div className="flex flex-wrap gap-2">
      <button type="button" className="menu_button" onClick={() => void image.direct({ purpose: "scene", text: "", messageId: null }).catch(() => undefined)}>Illustrate scene</button>
      <button type="button" className="menu_button" onClick={() => void image.direct({ purpose: "portrait", text: "", messageId: null }).catch(() => undefined)}>Portrait</button>
      <button type="button" className="menu_button" onClick={() => void image.direct({ purpose: "background", text: "", messageId: null }).catch(() => undefined)}>Background</button>
      {state.jobs.length > 0 && <button type="button" className="menu_button" onClick={() => image.queue.cancelAll()}>Stop images</button>}
    </div>
    <div role="status" className="text-xs opacity-80">{state.jobs.length ? state.jobs.map((job) => `${job.label}: ${job.state}`).join(" · ") : PLAYER_COPY.imageNoJobs}</div>
    {state.lastError && <div role="alert" data-so="image-error" className="text-xs so-error-text">{PLAYER_COPY.imageError}</div>}
  </section>;
}
