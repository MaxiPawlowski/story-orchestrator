import React, { useState } from "react";
import { getGlobalSettings, setGlobalSettings } from "@runtime/settingsStore";
import { RENDER_PRESETS, type RenderPreset } from "../../sprites/settings";

export interface RenderControls {
  preset: RenderPreset;
  steps: number;
  resolution: number;
  choose(next: RenderPreset): void;
  setSteps(value: number): void;
  setResolution(value: number): void;
}

export function useRenderControls(): RenderControls {
  const [preset, setPreset] = useState<RenderPreset>(() => getGlobalSettings().sprites.renderPreset);
  const [steps, setSteps] = useState(RENDER_PRESETS[preset].steps);
  const [resolution, setResolution] = useState(RENDER_PRESETS[preset].resolution);
  const choose = (next: RenderPreset) => {
    setPreset(next); setSteps(RENDER_PRESETS[next].steps); setResolution(RENDER_PRESETS[next].resolution);
    setGlobalSettings({ sprites: { renderPreset: next } });
  };
  return { preset, steps, resolution, choose, setSteps, setResolution };
}

export default function SpriteRenderControls({ controls, busy }: { controls: RenderControls; busy: boolean }) {
  return <>
    <label>Render preset<select id="so-sprite-render-preset" aria-label="Render preset" className="text_pole" disabled={busy} value={controls.preset}
      onChange={(event) => controls.choose(event.target.value as RenderPreset)}>
      <option value="standard">Standard: 1024 px, 25 steps</option><option value="fast">Fast preview: 512 px, 20 steps</option></select></label>
    <label>Steps<input type="number" min={1} max={100} className="text_pole" disabled={busy} value={controls.steps}
      onChange={(event) => controls.setSteps(Number(event.target.value))} /></label>
    <label>Edit resolution<select id="so-sprite-edit-resolution" aria-label="Edit resolution" className="text_pole" disabled={busy} value={controls.resolution}
      onChange={(event) => controls.setResolution(Number(event.target.value))}>{[512, 768, 1024].map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
  </>;
}
