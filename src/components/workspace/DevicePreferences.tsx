import { useState } from "react";
import { devicePreferences } from "@runtime/featureSettingsHost";
import { DEVICE_SETTING_PATHS, deviceSettingValue } from "@runtime/deviceSettings";
import { getGlobalSettings } from "@runtime/settingsStore";
import type { RuntimeManager } from "@runtime/runtimeManager";
import { PolicyInput } from "./FeaturePolicyFields";
import type { FeaturePolicyValue, PolicyField } from "@engine/featurePolicy";
import { log } from "@utils/log";
import { INLINE_CATEGORIES } from "@runtime/settingsModel";
import { isRecord } from "@utils/guards";

const LABELS = [
  "Status strip", "Notes under replies", "Notes on the last … replies", "Note categories", "Stage visibility",
  "Dim non-speakers", "Breathing", "Blinking", "Mouth movement", "Live close-shot head", "Drawn eyes and mouth on the live head",
];

export const DevicePreferences = ({ manager }: { manager: RuntimeManager }) => {
  const [device, setDevice] = useState(() => devicePreferences().read());
  const [error, setError] = useState<string | null>(null);
  return <section><h2>This device</h2><p>Display and animation preferences stay in this browser and account. Model connections and story behavior remain shared.</p>
    {DEVICE_SETTING_PATHS.map((path, index) => {
      const resolved = deviceSettingValue(getGlobalSettings(), device, path);
      const spec: PolicyField = path.endsWith("level") ? { kind: "choice", options: ["0", "1", "2", "3", "4"] } : path.endsWith("window") ? { kind: "number", min: 1, max: 200 }
        : path.endsWith("stage") ? { kind: "choice", options: ["vn", "always", "off"] } : path.endsWith("mouth") ? { kind: "choice", options: ["off", "simple", "smooth"] } : { kind: "boolean" };
      const write = (value: unknown) => {
        try { setDevice(devicePreferences().set(path, value)); setError(null); manager.notify(); }
        catch (error) { log.warn("Device preference save failed", error); setError("This browser could not save its device preferences."); }
      };
      if (path.endsWith("categories")) {
        const categories = isRecord(resolved.value) ? resolved.value : {};
        return <fieldset key={path}><legend>Note categories <span className="so-source-chip">{resolved.source === "device" ? "This device" : "Default"}</span></legend>
          {INLINE_CATEGORIES.map((category) => <label key={category} className="so-control-toggle">
            <input type="checkbox" checked={categories[category] !== false}
              onChange={(event) => write({ ...categories, [category]: event.target.checked })} />{category}
          </label>)}
          {resolved.source === "device" && <button className="st-button secondary" onClick={() => write(undefined)}>Reset note categories</button>}
        </fieldset>;
      }
      return <div className="so-control-row" key={path}><PolicyInput id={`so-device-${index}`} label={LABELS[index]} spec={spec} value={resolved.value as FeaturePolicyValue}
        onChange={(value) => write(path.endsWith("level") ? Number(value) : value)} />
        <span className="so-source-chip">{resolved.source === "device" ? "This device" : "Default"}</span>
        {resolved.source === "device" && <button className="st-button secondary" aria-label={`Reset ${LABELS[index]} to default`} onClick={() => write(undefined)}>Reset</button>}
      </div>;
    })}
    {error && <p role="alert">{error}</p>}
  </section>;
};
