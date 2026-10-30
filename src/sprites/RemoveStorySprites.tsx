import { useState } from "react";
import { showConfirmPopup } from "@services/STAPI";
import { removeStorySprites } from "@services/stHost/media";
import { log } from "@utils/log";
import { SettingRow } from "@components/ui/SettingRow";
import { Button } from "@components/ui/Button";

export interface RemoveStorySpritesProps {
  storyId: string;
  storyTitle: string | null;
  confirm?: (question: string) => Promise<boolean>;
  remove?: typeof removeStorySprites;
}

const ask = (question: string) => showConfirmPopup(question, { okButton: "Remove", cancelButton: "Keep" });

export default function RemoveStorySprites({ storyId, storyTitle, confirm = ask, remove = removeStorySprites }: RemoveStorySpritesProps) {
  const [notice, setNotice] = useState<string | null>(null);
  const run = async () => {
    if (!await confirm(`Remove Story Orchestrator's generated sprites for "${storyTitle ?? storyId}"? Sprites you built yourself stay.`)) return;
    const result = await remove(storyId);
    if (!result.ok) { log.warn("generated sprite removal failed", result.reason); setNotice("Could not remove them. Check the media plugin."); return; }
    setNotice(result.labels ? `Removed ${result.labels} generated sprite files.` : "There were none to remove.");
  };
  return <SettingRow label="Generated sprites" description={notice ? <span id="so-sprite-remove-notice" role="status">{notice}</span>
    : "Remove the sprites Story Orchestrator generated for this story. Sprites you built yourself stay."}
    control={<Button id="so-sprite-remove-story" variant="danger" size="sm" work={run}>Remove generated sprites</Button>} />;
}
