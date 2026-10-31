import { gateKeys, type Story, type TensionLevel } from "@engine/index";
import { TIME_KEYS } from "@engine/validate/quests";

type RushCode = "exit-on-entry";

export const RUSH_CONSEQUENCES: Record<RushCode, string> = {
  "exit-on-entry": "A tense scene can end on the turn it starts: one reply that writes the outcome moves the story on before the player has acted there.",
};

export interface RushRun {
  draft: Story;
  push: (code: RushCode, severity: "info", path: string, message: string) => void;
}

const RUSH_LEVELS: ReadonlySet<TensionLevel> = new Set(["tense", "critical", "peak"]);

export const checkRushDiagnostics = ({ draft, push }: RushRun) => {
  const byId = new Map(draft.checkpoints.map((checkpoint) => [checkpoint.id, checkpoint]));
  draft.transitions.forEach((transition, index) => {
    const from = byId.get(transition.from);
    if (!from || from.type !== "anchor" || !from.tension_target || !RUSH_LEVELS.has(from.tension_target)) return;
    if (from.min_turns !== undefined || transition.urgent === true || from.stretch?.mode === "open") return;
    if (gateKeys(transition.gate).some((key) => TIME_KEYS.includes(key))) return;
    const to = byId.get(transition.to)?.name ?? transition.to;
    push("exit-on-entry", "info", `transitions.${index}.gate`,
      `the exit to "${to}" can open on the turn the story enters "${from.name}" (tension ${from.tension_target}); `
        + "set min_turns on the checkpoint, add a turn count to the gate, or mark the exit urgent");
  });
};
