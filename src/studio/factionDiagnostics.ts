import { FACTION_KEY_PREFIX, standingKey, type StoryV2 } from "@engine/index";
import { inactionProblem } from "@engine/validate/factions";

type FactionCode = "faction-move-on-inaction" | "faction-never-moves" | "faction-no-visible-band" | "faction-snapshot-key";

export const FACTION_CONSEQUENCES: Record<FactionCode, string> = {
  "faction-move-on-inaction": "The story cannot load: this move would punish the player for doing nothing.",
  "faction-never-moves": "This group's standing never changes, so its members always open the same way.",
  "faction-no-visible-band": "The player never sees how this group regards them.",
  "faction-snapshot-key": "A checkpoint's expected values are never written, so this standing does not change there.",
};

export interface FactionRun {
  draft: StoryV2;
  push: (code: FactionCode, severity: "blocking" | "warning", path: string, message: string) => void;
}

const rewardTargets = (draft: StoryV2): Set<string> => new Set((draft.quests ?? []).flatMap((quest) => Object.keys(quest.reward?.set ?? {})));

const rowFactions = (draft: StoryV2): Set<string> => new Set((draft.widgets ?? []).flatMap((widget) => (widget.rows ?? []).flatMap((row) => (row.faction ? [row.faction] : []))));

const startValues = (draft: StoryV2) => Object.fromEntries(draft.qualities.flatMap((quality) => (quality.step_rule?.start !== undefined ? [[quality.key, quality.step_rule.start]] : [])));

export const checkFactionDiagnostics = ({ draft, push }: FactionRun) => {
  const start = startValues(draft);
  const rewarded = rewardTargets(draft);
  const rows = rowFactions(draft);
  (draft.factions ?? []).forEach((faction, index) => {
    const path = `factions.${index}`;
    faction.moves.forEach((move, at) => {
      const problem = move.add < 0 ? inactionProblem(move.when, start) : null;
      if (problem) push("faction-move-on-inaction", "blocking", `${path}.moves.${at}.when`, `move '${move.id}' of '${faction.id}' lowers standing on inaction: ${problem}`);
    });
    if (!faction.moves.length && !rewarded.has(standingKey(faction.id))) {
      push("faction-never-moves", "warning", `${path}.moves`, `'${faction.id}' has no move and no quest reward writes ${standingKey(faction.id)}`);
    }
    if (draft.display?.standing === false && !rows.has(faction.id)) push("faction-no-visible-band", "warning", path, `Standing is switched off and no roster panel row shows '${faction.id}'`);
  });
  draft.checkpoints.forEach((checkpoint, index) => Object.keys(checkpoint.state_snapshot ?? {}).forEach((key) => {
    if (!key.startsWith(FACTION_KEY_PREFIX)) return;
    push("faction-snapshot-key", "warning", `checkpoints.${index}.state_snapshot.${key}`, `'${key}' in a snapshot is never applied; move standing with a faction move or a quest reward`);
  }));
};
