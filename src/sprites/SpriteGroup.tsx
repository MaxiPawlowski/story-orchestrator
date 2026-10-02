import React, { useEffect, useState } from "react";
import { spriteOnStageText } from "@runtime/narrative";
import type { SpriteStage } from "./stage";
import { listConnectionProfiles } from "@services/STAPI";
import type { RuntimeManager } from "@runtime/runtimeManager";
import { storySpriteChoice, userSpriteChoice } from "./activation";
import { startSprites } from "./start";
import { SpriteSettingsView } from "./SpriteSettingsView";

export default function SpriteGroup({ manager }: { manager: RuntimeManager }) {
  const [stage, setStage] = useState<SpriteStage | null>(null);
  const [, refresh] = useState(0);
  useEffect(() => { setStage(startSprites(manager)); }, [manager]);
  useEffect(() => (stage ? stage.subscribe(() => refresh((count) => count + 1)) : undefined), [stage]);
  if (!stage) return null;
  const view = stage.view();
  return (
    <SpriteSettingsView
      settings={view.settings}
      activation={view.activation}
      waitsForVn={view.waitsForVn}
      capability={view.capability}
      profiles={listConnectionProfiles()}
      onStage={view.actors.length ? spriteOnStageText(view.actors.map((actor) => actor.name)) : ""}
      onChange={(patch) => stage.updateSettings(patch)}
      onSwitch={(enabled) => stage.updateSettings(userSpriteChoice(enabled))}
      onStoryDecides={() => stage.updateSettings(storySpriteChoice())}
    />
  );
}
