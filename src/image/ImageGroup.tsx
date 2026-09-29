import { useEffect, useState } from "react";
import { imageChat, listConnectionProfiles } from "@services/STAPI";
import type { RuntimeManager } from "@runtime/runtimeManager";
import { ASPECTS, CHECKPOINTS, SHOTS, type Aspect, type Placement, type Purpose, type Quality, type Shot } from "./catalog";
import { type ImageBinding, type ImageRoute, type ImageSettings } from "./settings";
import { startImage } from "./start";
import HelpTooltip from "@components/studio/HelpTooltip";

const PURPOSES: Purpose[] = ["scene", "character", "portrait", "user", "background", "free"];
const PLACEMENTS: Placement[] = ["inline", "message", "background"];
const quality = ["base", "hires"] as const;

const useImage = (manager: RuntimeManager) => {
  const [image] = useState(() => startImage(manager));
  const [, refresh] = useState(0);
  useEffect(() => image.subscribe(() => refresh((number) => number + 1)), [image]);
  return image;
};

export default function ImageGroup({ manager }: { manager: RuntimeManager }) {
  const image = useImage(manager);
  const [selectedPurpose, setSelectedPurpose] = useState<Purpose>("scene");
  const settings = image.settings();
  const people = imageChat()?.characters ?? [];
  const profiles = listConnectionProfiles();
  const change = (patch: Partial<ImageSettings>) => image.updateSettings(patch);
  const route = (purpose: Purpose, patch: Partial<ImageRoute>) => change({ purposes: { ...settings.purposes, [purpose]: { ...settings.purposes[purpose], ...patch } } });
  const binding = (key: string, patch: Partial<ImageBinding>) => {
    const current = settings.characters[key] ?? { appearanceTags: "", appearanceProse: "", checkpoint: "", loras: [], alwaysTags: "", neverTags: "", seed: null };
    change({ characters: { ...settings.characters, [key]: { ...current, ...patch } } });
  };
  const option = (values: readonly string[]) => values.map((value) => <option key={value} value={value}>{value}</option>);
  const entry = settings.purposes[selectedPurpose];
  return (
    <details id="so-image-settings" className="rounded border border-[var(--SmartThemeBorderColor)] p-2 text-sm">
      <summary className="cursor-pointer font-semibold">Image service <span className="opacity-60 font-normal">— this install</span></summary>
      <div className="flex flex-col gap-2 py-2">
        <p>This install provides the model and ComfyUI. Story authors choose the scenes and style; players can pause images for their chat.
          Renders wait for text and queue it while ComfyUI uses the GPU.</p>
        <label className="flex items-center gap-2">
          <input id="so-image-enabled" type="checkbox" checked={settings.enabled} onChange={(event) => change({ enabled: event.target.checked })} />
          Permit automatic illustrations on this install
          <HelpTooltip title="Automatic rendering also needs an automation mode, a story requesting cues, and a chat that has not paused them. Manual images remain available."
            href="/scripts/extensions/third-party/story-orchestrator/README.md#illustrations-and-scope" reference="Illustration setup" />
        </label>
        <label className="flex flex-col gap-1">
          <span>Automation for all chats <HelpTooltip title={"Story: follow each story's authored checkpoint/scene choices. " +
            "Every N: draw every N replies and at each of the story's checkpoint/scene choices. " +
            "Tool: let the model ask. Manual: draw only when you ask."}
            href="/scripts/extensions/third-party/story-orchestrator/README.md#illustrations-and-scope" reference="When images appear" /></span>
          <select id="so-image-mode" className="text_pole" value={settings.automation.mode} onChange={(event) => change({
            automation: { ...settings.automation, mode: event.target.value as ImageSettings["automation"]["mode"] },
          })}>
            <option value="manual">Manual only</option><option value="story">Story-authored moments</option>
            <option value="everyN">Every N replies + story moments</option><option value="tool">Model requests</option>
          </select>
        </label>
        {settings.automation.mode === "everyN" && <label>Every N replies
          <input type="number" min={1} max={100} className="text_pole" value={settings.automation.everyN} onChange={(event) => change({
            automation: { ...settings.automation, everyN: Math.max(1, Number(event.target.value)) },
          })} />
        </label>}
        <label className="flex flex-col gap-1">
          <span>Image-prompt model <HelpTooltip title={"A Connection Manager profile that turns the current scene and the story's visual direction into a ComfyUI prompt. " +
            "This is separate from the chat model."} /></span>
          <select id="so-image-profile" className="text_pole" value={settings.directorProfileId} onChange={(event) => change({ directorProfileId: event.target.value })}>
            <option value="">Select a Connection Manager profile</option>
            {profiles.map((profile) => <option key={profile.id} value={profile.id}>{profile.name}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span>ComfyUI URL <HelpTooltip title="The address of your ComfyUI server. When text and image models share a GPU, use the local GPU broker for your text profiles." /></span>
          <input className="text_pole" value={settings.comfyUrl} placeholder="http://127.0.0.1:8188" onChange={(event) => change({ comfyUrl: event.target.value })} />
        </label>
        <label className="flex items-center gap-2"><input type="checkbox" checked={settings.safeMode} onChange={(event) => change({ safeMode: event.target.checked })} />Avoid explicit imagery</label>
        <details>
          <summary>Default image routes <span className="opacity-60">— advanced</span></summary>
          <p className="text-xs opacity-80">These are install defaults. A story supplies visual intent; the selected route picks model, size and placement for each image type.</p>
          <label className="flex flex-col gap-1">Edit route
            <select className="text_pole" value={selectedPurpose} onChange={(event) => setSelectedPurpose(event.target.value as Purpose)}>
              {PURPOSES.map((purpose) => <option key={purpose} value={purpose}>{purpose}</option>)}
            </select>
          </label>
          <fieldset className="my-2 flex flex-col gap-1 rounded border p-2">
              <legend className="font-semibold">{selectedPurpose}</legend>
              <label>Model
                <select className="text_pole" value={entry.checkpoint} onChange={(event) => route(selectedPurpose, { checkpoint: event.target.value })}>
                  {CHECKPOINTS.map((checkpoint) => <option key={checkpoint.file} value={checkpoint.file}>{checkpoint.label}</option>)}
                </select>
              </label>
              <label>Quality
                <select className="text_pole" value={entry.quality} onChange={(event) => route(selectedPurpose, { quality: event.target.value as Quality })}>
                  {option(quality)}
                </select>
              </label>
              <label>Aspect
                <select className="text_pole" value={entry.aspect} onChange={(event) => route(selectedPurpose, { aspect: event.target.value as Aspect | "auto" })}>
                  {option(["auto", ...ASPECTS])}
                </select>
              </label>
              <label>Shot
                <select className="text_pole" value={entry.shot} onChange={(event) => route(selectedPurpose, { shot: event.target.value as Shot })}>
                  {option(SHOTS)}
                </select>
              </label>
              <label>Placement
                <select className="text_pole" value={entry.placement} onChange={(event) => route(selectedPurpose, { placement: event.target.value as Placement })}>
                  {option(PLACEMENTS)}
                </select>
              </label>
              <label>Candidates
                <input className="text_pole" type="number" min={1} max={4} value={entry.candidates} onChange={(event) => route(selectedPurpose, { candidates: Number(event.target.value) })} />
              </label>
              <label className="flex items-center gap-2">
                 <input type="checkbox" checked={entry.directorMayOverride} onChange={(event) => route(selectedPurpose, { directorMayOverride: event.target.checked })} />
                Let the director select another model
              </label>
              <label>Extra positive <input className="text_pole" value={entry.extraPositive} onChange={(event) => route(selectedPurpose, { extraPositive: event.target.value })} /></label>
              <label>Extra negative <input className="text_pole" value={entry.extraNegative} onChange={(event) => route(selectedPurpose, { extraNegative: event.target.value })} /></label>
          </fieldset>
        </details>
        <details>
          <summary>Fallback card appearance <span className="opacity-60">— this install</span></summary>
          <p className="text-xs opacity-80">Used when the story has not authored an appearance for this cast member.</p>
          {people.map((person) => {
            const selected = settings.characters[person.key];
            return <details key={person.key} className="rounded border p-1"><summary>{person.name}</summary>
              <label>Fixed image tags
                <textarea className="text_pole" value={selected?.appearanceTags ?? ""} onChange={(event) => binding(person.key, { appearanceTags: event.target.value })} />
              </label>
              <label>Always include <input className="text_pole" value={selected?.alwaysTags ?? ""} onChange={(event) => binding(person.key, { alwaysTags: event.target.value })} /></label>
              <label>Never include <input className="text_pole" value={selected?.neverTags ?? ""} onChange={(event) => binding(person.key, { neverTags: event.target.value })} /></label>
            </details>;
          })}
        </details>
      </div>
    </details>
  );
}
