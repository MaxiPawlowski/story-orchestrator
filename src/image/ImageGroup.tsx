import { useEffect, useState } from "react";
import { listConnectionProfiles } from "@services/STAPI";
import type { RuntimeManager } from "@runtime/runtimeManager";
import { ASPECTS, familyOf, SHOTS, type Aspect, type Placement, type Purpose, type Quality, type Shot } from "./catalog";
import { type ImageRoute, type ImageSettings } from "./settings";
import { startImage } from "./start";
import { guideUrl } from "@features/guideLinks";
import { settingCopy } from "@features/settingsCopy";
import { CheckRow, FieldLabel, HelpText } from "@components/settings/Field";
import { ProfileOptions } from "@components/settings/ProfileOptions";
import { SettingRow } from "@components/ui/SettingRow";
import { Section } from "@components/ui/Section";
import { Select, TextInput } from "@components/ui/Field";
import { Button } from "@components/ui/Button";
import { Card } from "@components/ui/Card";
import { comfyDiscover } from "@services/stHost/media";
import { FAMILIES } from "./catalog";
import GpuBrokerLine from "./GpuBrokerLine";
import ModelSources from "./ModelSources";

const PURPOSES: Purpose[] = ["scene", "character", "portrait", "user", "background", "free"];
const PLACEMENTS: Placement[] = ["inline", "message", "background"];
const quality = ["base", "hires"] as const;
const familyNote = (file: string, wanted: string): string => {
  const found = familyOf(file);
  if (found === wanted) return "";
  return found ? ` (${FAMILIES[found].label})` : " (family not recognised)";
};

const useImage = (manager: RuntimeManager) => {
  const [image] = useState(() => startImage(manager));
  const [, refresh] = useState(0);
  useEffect(() => image.subscribe(() => refresh((number) => number + 1)), [image]);
  return image;
};

export type ImageView = "main" | "picture-types" | "model-sources";

const copyRow = (key: Parameters<typeof settingCopy>[0]) => ({ label: settingCopy(key).label, description: <HelpText text={settingCopy(key).help} /> });

export default function ImageGroup({ manager, view = "main", onOpenView }: { manager: RuntimeManager; view?: ImageView; onOpenView?: (view: Exclude<ImageView, "main">) => void }) {
  const image = useImage(manager);
  const [selectedPurpose, setSelectedPurpose] = useState<Purpose>("scene");
  const [testResult, setTestResult] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);
  const [installed, setInstalled] = useState<string[]>([]);
  const settings = image.settings();
  const profiles = listConnectionProfiles();
  const change = (patch: Partial<ImageSettings>) => image.updateSettings(patch);
  const route = (purpose: Purpose, patch: Partial<ImageRoute>) => change({ purposes: { ...settings.purposes, [purpose]: { ...settings.purposes[purpose], ...patch } } });
  const option = (values: readonly string[]) => values.map((value) => <option key={value} value={value}>{value}</option>);
  const entry = settings.purposes[selectedPurpose];
  const routeId = (field: string) => `so-image-route-${field}`;
  const guide = guideUrl("setup/images.md");
  if (view === "model-sources") return <Section id="so-image-model-sources" title="Model sources" level={3} description="Civitai and Hugging Face keys used to download image models.">
    <ModelSources />
  </Section>;
  if (view === "picture-types") return <Section id="so-image-routes" title="Picture types" level={3}
    description="These are install defaults. A story supplies what to draw; each picture type picks the model, size and placement.">
    <SettingRow label="Picture type" htmlFor={routeId("purpose")} description="Choose which kind of picture to edit below."
      control={<Select id={routeId("purpose")} size="sm" value={selectedPurpose} onChange={(event) => setSelectedPurpose(event.target.value as Purpose)}>
        {PURPOSES.map((purpose) => <option key={purpose} value={purpose}>{purpose}</option>)}
      </Select>} />
    <fieldset className="so-fieldset">
      <legend>{selectedPurpose}</legend>
      {settings.backend === "comfy" && <>
        <Button className="self-start" size="sm" onClick={() => {
          void comfyDiscover().then((models) => setInstalled(models.checkpoints)).catch((error) => setTestResult(String(error)));
        }}>Discover installed image models</Button>
        <FieldLabel htmlFor={routeId("family")} setting="image.purposes.*.family" />
        <Select id={routeId("family")} value={entry.family} onChange={(event) => route(selectedPurpose, { family: event.target.value })}>
          {Object.values(FAMILIES).map((family) => <option key={family.id} value={family.id}>{family.label}</option>)}
        </Select>
        <FieldLabel htmlFor={routeId("checkpoint")} setting="image.purposes.*.checkpoint" />
        <Select id={routeId("checkpoint")} size="lg" value={entry.checkpoint} onChange={(event) => route(selectedPurpose, { checkpoint: event.target.value })}>
          <option value="">Pick the one installed {FAMILIES[entry.family]?.label ?? "matching"} model</option>
          {[...new Set([entry.checkpoint, ...installed])].filter(Boolean).map((file) => <option key={file} value={file}>
            {file}{familyNote(file, entry.family)}</option>)}
        </Select>
      </>}
      <SettingRow {...copyRow("image.purposes.*.quality")} htmlFor={routeId("quality")}
        control={<Select id={routeId("quality")} size="sm" value={entry.quality} onChange={(event) => route(selectedPurpose, { quality: event.target.value as Quality })}>{option(quality)}</Select>} />
      <SettingRow {...copyRow("image.purposes.*.aspect")} htmlFor={routeId("aspect")}
        control={<Select id={routeId("aspect")} size="sm" value={entry.aspect}
          onChange={(event) => route(selectedPurpose, { aspect: event.target.value as Aspect | "auto" })}>{option(["auto", ...ASPECTS])}</Select>} />
      <SettingRow {...copyRow("image.purposes.*.shot")} htmlFor={routeId("shot")}
        control={<Select id={routeId("shot")} size="sm" value={entry.shot} onChange={(event) => route(selectedPurpose, { shot: event.target.value as Shot })}>{option(SHOTS)}</Select>} />
      <SettingRow {...copyRow("image.purposes.*.placement")} htmlFor={routeId("placement")}
        control={<Select id={routeId("placement")} size="sm" value={entry.placement}
          onChange={(event) => route(selectedPurpose, { placement: event.target.value as Placement })}>{option(PLACEMENTS)}</Select>} />
      <SettingRow {...copyRow("image.purposes.*.candidates")} htmlFor={routeId("candidates")}
        control={<TextInput id={routeId("candidates")} size="xs" type="number" min={1} max={4} value={entry.candidates}
          onChange={(event) => route(selectedPurpose, { candidates: Number(event.target.value) })} />} />
      <CheckRow id={routeId("override")} setting="image.purposes.*.directorMayOverride" checked={entry.directorMayOverride}
        onChange={(on) => route(selectedPurpose, { directorMayOverride: on })} />
      <FieldLabel htmlFor={routeId("positive")} setting="image.purposes.*.extraPositive" />
      <TextInput id={routeId("positive")} value={entry.extraPositive} onChange={(event) => route(selectedPurpose, { extraPositive: event.target.value })} />
      <FieldLabel htmlFor={routeId("negative")} setting="image.purposes.*.extraNegative" />
      <TextInput id={routeId("negative")} value={entry.extraNegative} onChange={(event) => route(selectedPurpose, { extraNegative: event.target.value })} />
    </fieldset>
    {testResult && <p role="status">{testResult}</p>}
  </Section>;
  return (
    <Section id="so-image-settings" title="Illustrations" level={3}
      description="Uses your image service. Story authors choose scenes and style; players can pause pictures for their chat. Pictures are drawn after the text is done.">
      <CheckRow id="so-image-enabled" setting="image.enabled" checked={settings.enabled} onChange={(on) => change({ enabled: on })} />
      <SettingRow {...copyRow("image.backend")} htmlFor="so-image-backend"
        control={<>
          <Select id="so-image-backend" size="lg" value={settings.backend} onChange={(event) => change({ backend: event.target.value as ImageSettings["backend"] })}>
            <option value="st">Use SillyTavern Image Generation settings</option><option value="comfy">Advanced ComfyUI recipes</option>
          </Select>
          <Button id="so-image-test" size="sm" busy={testing} onClick={() => {
            setTesting(true); setTestResult(null);
            void image.direct({ purpose: "free", text: "A small still life of a red apple on a wooden table", raw: true, messageId: null }, { placement: "message", candidates: 1 })
              .then((path) => setTestResult(path ? `Test render saved: ${path}` : "Test render discarded."))
              .catch((error) => setTestResult(error instanceof Error ? error.message : String(error)))
              .finally(() => setTesting(false));
          }}>Test render</Button>
        </>} />
      {testResult && <p role="status">{testResult}</p>}
      <SettingRow {...copyRow("image.automation.mode")} htmlFor="so-image-mode"
        control={<Select id="so-image-mode" size="lg" value={settings.automation.mode} onChange={(event) => change({
          automation: { ...settings.automation, mode: event.target.value as ImageSettings["automation"]["mode"] },
        })}>
          <option value="manual">Only when asked</option><option value="story">Story moments</option>
          <option value="everyN">Every few replies, and story moments</option><option value="tool">When the model asks</option>
        </Select>} />
      {settings.automation.mode === "everyN" && <SettingRow {...copyRow("image.automation.everyN")} htmlFor="so-image-every-n"
        control={<TextInput id="so-image-every-n" size="xs" type="number" min={1} max={100} value={settings.automation.everyN} onChange={(event) => change({
          automation: { ...settings.automation, everyN: Math.max(1, Number(event.target.value)) },
        })} />} />}
      <SettingRow {...copyRow("image.automaticRoute")} htmlFor="so-image-automatic-route"
        control={<Select id="so-image-automatic-route" size="lg" value={settings.automaticRoute}
          onChange={(event) => change({ automaticRoute: event.target.value as ImageSettings["automaticRoute"] })}>
          <option value="auto">Auto: references when every character is prepared</option><option value="sdxl">Always SDXL tags</option>
          <option value="qwen">References only (skip otherwise)</option>
        </Select>} />
      <SettingRow {...copyRow("image.directorProfileId")} htmlFor="so-image-profile"
        control={<Select id="so-image-profile" size="lg" value={settings.directorProfileId} onChange={(event) => change({ directorProfileId: event.target.value })}>
          <option value="">Template prompt (no extra model)</option>
          <ProfileOptions profiles={profiles} />
        </Select>} />
      <SettingRow {...copyRow("image.comfyUrl")} htmlFor="so-image-comfy-url"
        control={<TextInput id="so-image-comfy-url" size="lg" value={settings.comfyUrl} placeholder="http://127.0.0.1:8188" onChange={(event) => change({ comfyUrl: event.target.value })} />} />
      <GpuBrokerLine />
      <CheckRow id="so-image-safe-mode" setting="image.safeMode" checked={settings.safeMode} onChange={(on) => change({ safeMode: on })} />
      {onOpenView && <div className="so-subpage-links">
        <Card interactive id="so-image-open-picture-types" onClick={() => onOpenView("picture-types")} title="Picture types">Model, size and placement for each kind of picture.</Card>
        <Card interactive id="so-image-open-model-sources" onClick={() => onOpenView("model-sources")} title="Model sources">Civitai and Hugging Face keys for downloads.</Card>
      </div>}
      {guide && <a id="so-image-guide" className="so-setting-desc" href={guide} target="_blank" rel="noreferrer">How illustrations are set up</a>}
      <p className="so-setting-desc">Character appearances belong to the story. Edit them in Studio → Presentation.</p>
    </Section>
  );
}
