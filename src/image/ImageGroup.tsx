import { useEffect, useState } from "react";
import { listConnectionProfiles } from "@services/STAPI";
import { imageChat } from "@services/stHost/image";
import type { RuntimeManager } from "@runtime/runtimeManager";
import { ASPECTS, CHECKPOINTS, SHOTS, type Aspect, type Placement, type Purpose, type Quality, type Shot } from "./catalog";
import { type ImageBinding, type ImageRoute, type ImageSettings } from "./settings";
import { startImage } from "./start";
import { guideUrl } from "@features/registry";
import { Advanced, CheckRow, FieldLabel } from "@components/settings/Field";
import { ProfileOptions } from "@components/settings/ProfileOptions";
import { comfyDiscover } from "@services/stHost/media";
import { FAMILIES } from "./catalog";

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
  const [testResult, setTestResult] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);
  const [installed, setInstalled] = useState<string[]>([]);
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
  const routeId = (field: string) => `so-image-route-${field}`;
  const bindingId = (key: string, field: string) => `so-image-cast-${key.replace(/[^a-zA-Z0-9_-]/g, "_")}-${field}`;
  const guide = guideUrl("setup/images.md");
  return (
    <details id="so-image-settings" className="rounded border border-[var(--SmartThemeBorderColor)] p-2 text-sm">
      <summary className="cursor-pointer font-semibold">Image service <span className="opacity-70 font-normal">— this install</span></summary>
      <div className="flex flex-col gap-2 py-2">
        <p>Uses your image service. Story authors choose scenes and style; players can pause pictures for their chat.
          Pictures are drawn after the text is done. Advanced edits use ComfyUI and the optional media plugin.</p>
        <CheckRow id="so-image-enabled" setting="image.enabled" checked={settings.enabled} onChange={(on) => change({ enabled: on })} />
        <FieldLabel htmlFor="so-image-backend" setting="image.backend" />
        <select id="so-image-backend" className="text_pole" value={settings.backend} onChange={(event) => change({ backend: event.target.value as ImageSettings["backend"] })}>
          <option value="st">Use SillyTavern Image Generation settings</option><option value="comfy">Advanced ComfyUI recipes</option>
        </select>
        <button id="so-image-test" type="button" className="st-button" disabled={testing} onClick={() => {
          setTesting(true); setTestResult(null);
          void image.direct({ purpose: "free", text: "A small still life of a red apple on a wooden table", raw: true, messageId: null }, { placement: "message", candidates: 1 })
            .then((path) => setTestResult(path ? `Test render saved: ${path}` : "Test render discarded."))
            .catch((error) => setTestResult(error instanceof Error ? error.message : String(error)))
            .finally(() => setTesting(false));
        }}>Test render</button>
        {testResult && <p role="status">{testResult}</p>}
        <div className="flex flex-col gap-1">
          <FieldLabel htmlFor="so-image-mode" setting="image.automation.mode" />
          <select id="so-image-mode" className="text_pole" value={settings.automation.mode} onChange={(event) => change({
            automation: { ...settings.automation, mode: event.target.value as ImageSettings["automation"]["mode"] },
          })}>
            <option value="manual">Manual only</option><option value="story">Story-authored moments</option>
            <option value="everyN">Every N replies + story moments</option><option value="tool">Model requests</option>
          </select>
        </div>
        {settings.automation.mode === "everyN" && <div className="flex flex-col gap-1">
          <FieldLabel htmlFor="so-image-every-n" setting="image.automation.everyN" />
          <input id="so-image-every-n" type="number" min={1} max={100} className="text_pole" value={settings.automation.everyN} onChange={(event) => change({
            automation: { ...settings.automation, everyN: Math.max(1, Number(event.target.value)) },
          })} />
        </div>}
        <div className="flex flex-col gap-1">
          <FieldLabel htmlFor="so-image-profile" setting="image.directorProfileId" />
          <select id="so-image-profile" className="text_pole" value={settings.directorProfileId} onChange={(event) => change({ directorProfileId: event.target.value })}>
            <option value="">Template prompt (no extra model)</option>
            <ProfileOptions profiles={profiles} />
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <FieldLabel htmlFor="so-image-comfy-url" setting="image.comfyUrl" />
          <input id="so-image-comfy-url" className="text_pole" value={settings.comfyUrl} placeholder="http://127.0.0.1:8188" onChange={(event) => change({ comfyUrl: event.target.value })} />
        </div>
        <CheckRow id="so-image-safe-mode" setting="image.safeMode" checked={settings.safeMode} onChange={(on) => change({ safeMode: on })} />
        {guide && <a id="so-image-guide" className="text-xs underline" href={guide} target="_blank" rel="noreferrer">How illustrations are set up</a>}
        <Advanced id="so-image-routes" label="Picture types">
          <p className="text-xs opacity-80">These are install defaults. A story supplies what to draw; each picture type picks the model, size and placement.</p>
          <FieldLabel htmlFor={routeId("purpose")} label="Picture type" help="Choose which kind of picture to edit below." />
          <select id={routeId("purpose")} className="text_pole" value={selectedPurpose} onChange={(event) => setSelectedPurpose(event.target.value as Purpose)}>
            {PURPOSES.map((purpose) => <option key={purpose} value={purpose}>{purpose}</option>)}
          </select>
          <fieldset className="my-2 flex flex-col gap-1 rounded border p-2">
            <legend className="font-semibold">{selectedPurpose}</legend>
            <FieldLabel htmlFor={routeId("checkpoint")} setting="image.purposes.*.checkpoint" />
            {settings.backend === "comfy" && <>
              <button type="button" className="st-button" onClick={() => {
                void comfyDiscover().then((models) => setInstalled(models.checkpoints)).catch((error) => setTestResult(String(error)));
              }}>Discover installed image models</button>
              <FieldLabel htmlFor={routeId("family")} setting="image.purposes.*.family" />
              <select id={routeId("family")} className="text_pole" value={entry.family} onChange={(event) => route(selectedPurpose, { family: event.target.value })}>
                {Object.values(FAMILIES).map((family) => <option key={family.id} value={family.id}>{family.label}</option>)}
              </select>
            </>}
            <select id={routeId("checkpoint")} className="text_pole" value={entry.checkpoint} onChange={(event) => route(selectedPurpose, { checkpoint: event.target.value })}>
              {settings.backend === "comfy" ? [...new Set([entry.checkpoint, ...installed])].map((file) => <option key={file} value={file}>{file}</option>)
                : CHECKPOINTS.map((checkpoint) => <option key={checkpoint.file} value={checkpoint.file}>{checkpoint.label}</option>)}
            </select>
            <FieldLabel htmlFor={routeId("quality")} setting="image.purposes.*.quality" />
            <select id={routeId("quality")} className="text_pole" value={entry.quality} onChange={(event) => route(selectedPurpose, { quality: event.target.value as Quality })}>
              {option(quality)}
            </select>
            <FieldLabel htmlFor={routeId("aspect")} setting="image.purposes.*.aspect" />
            <select id={routeId("aspect")} className="text_pole" value={entry.aspect} onChange={(event) => route(selectedPurpose, { aspect: event.target.value as Aspect | "auto" })}>
              {option(["auto", ...ASPECTS])}
            </select>
            <FieldLabel htmlFor={routeId("shot")} setting="image.purposes.*.shot" />
            <select id={routeId("shot")} className="text_pole" value={entry.shot} onChange={(event) => route(selectedPurpose, { shot: event.target.value as Shot })}>
              {option(SHOTS)}
            </select>
            <FieldLabel htmlFor={routeId("placement")} setting="image.purposes.*.placement" />
            <select id={routeId("placement")} className="text_pole" value={entry.placement} onChange={(event) => route(selectedPurpose, { placement: event.target.value as Placement })}>
              {option(PLACEMENTS)}
            </select>
            <FieldLabel htmlFor={routeId("candidates")} setting="image.purposes.*.candidates" />
            <input id={routeId("candidates")} className="text_pole" type="number" min={1} max={4} value={entry.candidates}
              onChange={(event) => route(selectedPurpose, { candidates: Number(event.target.value) })} />
            <CheckRow id={routeId("override")} setting="image.purposes.*.directorMayOverride" checked={entry.directorMayOverride}
              onChange={(on) => route(selectedPurpose, { directorMayOverride: on })} />
            <FieldLabel htmlFor={routeId("positive")} setting="image.purposes.*.extraPositive" />
            <input id={routeId("positive")} className="text_pole" value={entry.extraPositive} onChange={(event) => route(selectedPurpose, { extraPositive: event.target.value })} />
            <FieldLabel htmlFor={routeId("negative")} setting="image.purposes.*.extraNegative" />
            <input id={routeId("negative")} className="text_pole" value={entry.extraNegative} onChange={(event) => route(selectedPurpose, { extraNegative: event.target.value })} />
          </fieldset>
        </Advanced>
        <Advanced id="so-image-cast" label="Fallback character looks">
          <p className="text-xs opacity-80">Used when the story has not described how this character looks.</p>
          {people.map((person) => {
            const selected = settings.characters[person.key];
            return <details key={person.key} className="rounded border p-1"><summary>{person.name}</summary>
              <FieldLabel htmlFor={bindingId(person.key, "tags")} setting="image.characters.*.appearanceTags" />
              <textarea id={bindingId(person.key, "tags")} className="text_pole" value={selected?.appearanceTags ?? ""}
                onChange={(event) => binding(person.key, { appearanceTags: event.target.value })} />
              <FieldLabel htmlFor={bindingId(person.key, "always")} setting="image.characters.*.alwaysTags" />
              <input id={bindingId(person.key, "always")} className="text_pole" value={selected?.alwaysTags ?? ""} onChange={(event) => binding(person.key, { alwaysTags: event.target.value })} />
              <FieldLabel htmlFor={bindingId(person.key, "never")} setting="image.characters.*.neverTags" />
              <input id={bindingId(person.key, "never")} className="text_pole" value={selected?.neverTags ?? ""} onChange={(event) => binding(person.key, { neverTags: event.target.value })} />
            </details>;
          })}
        </Advanced>
      </div>
    </details>
  );
}
