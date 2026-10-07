import React, { useEffect, useState } from "react";
import { spriteOnStageText } from "@runtime/narrative";
import type { SpriteStage } from "./stage";
import { listConnectionProfiles, showConfirmPopup } from "@services/STAPI";
import { removeStorySprites } from "@services/stHost/media";
import { log } from "@utils/log";
import type { RuntimeManager } from "@runtime/runtimeManager";
import { storySpriteChoice, userSpriteChoice } from "./activation";
import { startSprites } from "./start";
import { SpriteSettingsView } from "./SpriteSettingsView";

export default function SpriteGroup({ manager }: { manager: RuntimeManager }) {
  const [stage, setStage] = useState<SpriteStage | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [, refresh] = useState(0);
  useEffect(() => { setStage(startSprites(manager)); }, [manager]);
  useEffect(() => (stage ? stage.subscribe(() => refresh((count) => count + 1)) : undefined), [stage]);
  if (!stage) return null;
  const view = stage.view();
  const snapshot = manager.getSnapshot();
  const storyId = snapshot.storyId;
  const remove = storyId ? async () => {
    const confirmed = await showConfirmPopup(`Remove Story Orchestrator's generated sprites for "${snapshot.storyTitle ?? storyId}"? Sprites you built yourself stay.`,
      { okButton: "Remove", cancelButton: "Keep" });
    if (!confirmed) return;
    const result = await removeStorySprites(storyId);
    if (!result.ok) { log.warn("generated sprite removal failed", result.reason); setNotice("Could not remove them. Check the media plugin."); return; }
    setNotice(result.labels ? `Removed ${result.labels} generated sprite files.` : "There were none to remove.");
  } : undefined;
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
      onRemoveStorySprites={remove}
      removeNotice={notice}
    />
  );
}
