import React, { useEffect, useState } from "react";
import { listConnectionProfiles } from "@services/STAPI";
import type { RuntimeManager } from "@runtime/runtimeManager";
import { storySpriteChoice, userSpriteChoice } from "./settings";
import { startSprites } from "./start";
import { SpriteSettingsView } from "./SpriteSettingsView";

export default function SpriteGroup({ manager }: { manager: RuntimeManager }) {
  const [stage] = useState(() => startSprites(manager));
  const [, refresh] = useState(0);
  useEffect(() => stage.subscribe(() => refresh((count) => count + 1)), [stage]);
  const view = stage.view();
  return (
    <SpriteSettingsView
      settings={view.settings}
      activation={view.activation}
      capability={view.capability}
      profiles={listConnectionProfiles()}
      onStage={view.actors.length ? `On stage: ${view.actors.map((actor) => `${actor.name} (${actor.set}, ${actor.label})`).join(", ")}` : ""}
      onChange={(patch) => stage.updateSettings(patch)}
      onSwitch={(enabled) => stage.updateSettings(userSpriteChoice(enabled))}
      onStoryDecides={() => stage.updateSettings(storySpriteChoice())}
    />
  );
}
