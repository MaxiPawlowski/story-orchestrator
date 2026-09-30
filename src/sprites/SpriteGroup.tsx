import React, { useEffect, useState } from "react";
import { listConnectionProfiles } from "@services/STAPI";
import type { RuntimeManager } from "@runtime/runtimeManager";
import type { SpriteSettings, StageMode } from "./settings";
import { startSprites } from "./start";

export default function SpriteGroup({ manager }: { manager: RuntimeManager }) {
  const [stage] = useState(() => startSprites(manager));
  const [, refresh] = useState(0);
  useEffect(() => stage.subscribe(() => refresh((count) => count + 1)), [stage]);
  const settings = stage.view().settings;
  const change = (patch: Partial<SpriteSettings>) => stage.updateSettings(patch);
  const view = stage.view();
  return (
    <div id="so-sprite-settings" className="flex flex-col gap-2 border-t border-solid border-white/10 pt-2">
      <div className="text-sm font-bold">Sprite stage</div>
      <label className="flex items-center gap-2 text-sm">
        <input id="so-sprite-enabled" type="checkbox" checked={settings.enabled} onChange={(event) => change({ enabled: event.target.checked })} />
        <span>Show character sprites that change expression as replies stream</span>
      </label>
      <label className="flex flex-col gap-1 text-sm">
        <span>Stage</span>
        <select id="so-sprite-stage" value={settings.stage} onChange={(event) => change({ stage: event.target.value as StageMode })}>
          <option value="vn">With Visual Novel mode (/vn)</option>
          <option value="always">Always</option>
          <option value="off">Off</option>
        </select>
      </label>
      <label className="flex flex-col gap-1 text-sm">
        <span>Expression model when the judge is off or unavailable</span>
        <select id="so-sprite-profile" value={settings.profileId} onChange={(event) => change({ profileId: event.target.value })}>
          <option value="">Same as the image director</option>
          {listConnectionProfiles().map((profile) => <option key={profile.id} value={profile.id}>{profile.name}</option>)}
        </select>
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input id="so-sprite-focus" type="checkbox" checked={settings.focus} onChange={(event) => change({ focus: event.target.checked })} />
        <span>Dim whoever is not speaking</span>
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input id="so-sprite-breathing" type="checkbox" checked={settings.breathing} onChange={(event) => change({ breathing: event.target.checked })} />
        <span>Idle breathing</span>
      </label>
      <div className="text-xs opacity-70">
        {view.actors.length
          ? `On stage: ${view.actors.map((actor) => `${actor.name} (${actor.set}, ${actor.label})`).join(", ")}`
          : "No one in this chat has a sprite pack."}
      </div>
    </div>
  );
}
