import type { StoryV2 } from "@engine/index";
import { isRecord } from "@utils/guards";
import { readStageDirection } from "../sprites/direction";

type StageCode = "stage-sprite-unknown";

export const STAGE_CONSEQUENCES: Record<StageCode, string> = {
  "stage-sprite-unknown": "The stage cannot show this: the character has no installed sprite set or face by that name, so they keep the sprite they had.",
};

export interface StageInventory {
  spriteInventory?: () => Readonly<Record<string, { sets: readonly string[]; faces: readonly string[] }>>;
}

export interface StageRun {
  draft: StoryV2;
  context: StageInventory;
  push: (code: StageCode, severity: "warning", path: string, message: string) => void;
}

const memberKeys = (draft: StoryV2, key: string): string[] => {
  const member = draft.roster.find((entry) => entry.id.toLowerCase() === key || (entry.name ?? "").toLowerCase() === key);
  return [...new Set([key, ...(member ? [member.id.toLowerCase(), (member.name ?? member.id).toLowerCase()] : [])])];
};

export const checkStageSprites = ({ draft, context, push }: StageRun) => {
  const inventory = context.spriteInventory?.() ?? {};
  if (!Object.keys(inventory).length) return;
  draft.checkpoints.forEach((checkpoint, index) => {
    const effects = checkpoint.effects;
    const direction = isRecord(effects) ? readStageDirection(effects.stage) : null;
    if (!direction) return;
    for (const [key, entry] of Object.entries(direction.cast)) {
      const installed = memberKeys(draft, key).map((name) => inventory[name]).find(Boolean);
      if (!installed) continue;
      const path = `checkpoints.${index}.effects.stage.cast`;
      if (entry.set && !installed.sets.includes(entry.set)) {
        push("stage-sprite-unknown", "warning", path, `'${key}' has no sprite set '${entry.set}' installed; installed sets: ${installed.sets.join(", ") || "none"}`);
      }
      if (entry.face && !installed.faces.includes(entry.face)) {
        push("stage-sprite-unknown", "warning", path, `'${key}' has no '${entry.face}' sprite installed; installed faces: ${installed.faces.join(", ") || "none"}`);
      }
    }
  });
};
