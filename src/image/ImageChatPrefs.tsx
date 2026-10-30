import { useEffect, useState } from "react";
import type { RuntimeManager } from "@runtime/index";
import type { RuntimeSnapshot } from "@runtime/types";
import { imageAutomationText, PLAYER_COPY } from "@runtime/narrative";
import { startImage } from "./start";
import type { ImageOverride } from "./settings";
import { log } from "@utils/log";
import { CheckRow } from "@components/settings/Field";
import HelpTooltip from "@components/studio/HelpTooltip";
import { StatusText } from "@components/ui/StatusText";

export const IMAGE_PREFS_COPY = {
  heading: "Pictures in this chat",
  pause: "Pause automatic pictures in this chat",
  pauseHelp: "Only this chat is paused. Manual pictures still work, and other chats keep their own choice.",
  model: "Image model",
  modelDefault: "Use the install route",
  quality: "Quality",
  qualityDefault: "Use the route default",
  standard: "Standard",
  hires: "High resolution",
  direction: "Extra visual direction",
  directionPlaceholder: "This chat only",
} as const;

export default function ImageChatPrefs({ manager, snapshot }: { manager: RuntimeManager; snapshot: RuntimeSnapshot }) {
  const image = startImage(manager);
  const [, refresh] = useState(0);
  const [failed, setFailed] = useState(false);
  useEffect(() => image.subscribe(() => refresh((value) => value + 1)), [image]);
  const settings = image.settings();
  if (!settings.enabled) return null;
  const override = image.override();
  const models = [...new Set([override.checkpoint, ...Object.values(settings.purposes).map((route) => route.checkpoint)])].filter(Boolean);
  const update = (patch: Partial<ImageOverride>) => {
    setFailed(false);
    void image.setOverride({ ...override, ...patch }).catch((error: unknown) => {
      log.warn("image preference not saved", error);
      setFailed(true);
    });
  };
  const cues = [snapshot.imageStory?.checkpoints && "each new turn in the story", snapshot.imageStory?.scenes && "confirmed scene changes"].filter((cue): cue is string => typeof cue === "string");
  return <section id="so-image-chat" aria-labelledby="so-image-chat-heading" className="so-image-prefs">
    <h3 id="so-image-chat-heading" className="so-play-label">{IMAGE_PREFS_COPY.heading}
      <HelpTooltip title={IMAGE_PREFS_COPY.pauseHelp} href="/scripts/extensions/third-party/story-orchestrator/README.md#illustrations-and-scope" reference="Image preferences" /></h3>
    <p className="so-play-meta">{imageAutomationText(settings.automation.mode, cues, settings.automation.everyN)}</p>
    <CheckRow id="so-image-chat-pause" label={IMAGE_PREFS_COPY.pause} description={IMAGE_PREFS_COPY.pauseHelp} checked={override.paused} onChange={(paused) => update({ paused })} />
    {settings.backend === "comfy" && <label className="so-image-field">{IMAGE_PREFS_COPY.model}
      <select id="so-image-chat-model" className="text_pole" value={override.checkpoint} onChange={(event) => update({ checkpoint: event.target.value })}>
        <option value="">{IMAGE_PREFS_COPY.modelDefault}</option>{models.map((file) => <option key={file} value={file}>{file}</option>)}
      </select></label>}
    <label className="so-image-field">{IMAGE_PREFS_COPY.quality}
      <select id="so-image-chat-quality" className="text_pole" value={override.quality} onChange={(event) => update({ quality: event.target.value as ImageOverride["quality"] })}>
        <option value="">{IMAGE_PREFS_COPY.qualityDefault}</option><option value="base">{IMAGE_PREFS_COPY.standard}</option><option value="hires">{IMAGE_PREFS_COPY.hires}</option>
      </select></label>
    <label className="so-image-field">{IMAGE_PREFS_COPY.direction}
      <input id="so-image-chat-direction" className="text_pole" value={override.extraPositive} placeholder={IMAGE_PREFS_COPY.directionPlaceholder}
        onChange={(event) => update({ extraPositive: event.target.value })} />
    </label>
    {failed && <StatusText tone="error" role="alert" data-so="image-preference-error" className="so-play-meta">{PLAYER_COPY.imagePreferenceError}</StatusText>}
  </section>;
}
